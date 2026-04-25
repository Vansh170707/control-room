import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Cpu,
  FileText,
  FolderOpen,
  Globe,
  Github,
  Image as ImageIcon,
  Key,
  MessageCircle,
  Paperclip,
  Plus,
  ScrollText,
  Send,
  Server,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users2,
  Workflow,
  X,
} from "lucide-react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Toggle } from "@/components/ui/toggle";
import {
  useCommandCenterData,
  type CommandCenterDataMode,
} from "@/hooks/use-command-center-data";
import {
  cancelAgentRuntimeRun,
  createBrowserUseSession,
  executeAgentRuntimeCommandStream,
  getBrowserUseSession,
  getAgentRuntimeHealth,
  getRuntimeFileViewUrl,
  listBrowserUseSessions,
  listAgentRuntimeRuns,
  hasAgentRuntime,
  logoutGithubCopilotAuth,
  pollGithubCopilotDeviceAuth,
  sendAgentRuntimeChat,
  startGithubCopilotDeviceAuth,
  stopBrowserUseSession,
  subscribeToRuntimeEvents,
  retryRun,
  resumeRun,
  type BrowserUseSession,
  type RuntimeArtifact,
  type RuntimeChatMessage,
  type RuntimeCommandRunRecord,
  type RuntimeHealth,
  type RuntimeExecuteStreamEvent,
} from "@/lib/agent-runtime";
import {
  invokeTool,
  resolveToolApproval,
  type ToolStreamEvent as AgentToolStreamEvent,
} from "@/lib/agent-tools";
import type {
  ToolName,
  ToolApprovalRequest,
  ToolInvocationResult,
  ToolDefinition,
} from "@/lib/tool-definitions";
import { TOOL_DEFINITIONS } from "@/lib/tool-definitions";
import { supabase as supabaseClient, type Database } from "@/lib/supabase";
import type { Json } from "@/lib/supabase-types";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Agent, AgentStatus } from "@/data/mock-data";
import { routeUserRequest } from "@/lib/router";
import type { RouterDecision } from "@/lib/router/types";
import {
  buildMemoryContextMessage,
  loadMemoryContext,
  maybeRefreshThreadSummary,
  persistMemoryMessage,
  requestThoughtPlan,
  runCriticLoop,
} from "@/lib/phase2";
import {
  assessCommandRisk,
  estimateContextUsage,
} from "@/lib/phase3";
import {
  detectCapabilityGap,
  generateAgentBlueprint,
  parseAgentMentions,
} from "@/lib/phase4";
import {
  buildContextPackage,
  buildDispatcherDecision,
  buildKnowledgeGraph,
  buildPlanReviewRequest,
  buildVerifierReview,
  createTaskTreeFromDecision,
  detectCircuitBreakerEvent,
  deriveAgentHierarchy,
  type CircuitBreakerEvent,
  type ContextPackage,
  type DispatcherDecision,
  type KnowledgeGraph,
  type PlanReviewRequest,
  type TaskTree,
  type ToolDraft,
  type VerifierReview,
} from "@/lib/orchestration";
import {
  listAutomations,
  listAutomationRuns,
  triggerAutomation,
  getTriggerTypeLabel,
  type Automation,
  type AutomationRun,
} from "@/lib/automations";

import { Sidebar } from "./components/layout/Sidebar";
import { TopBanner } from "./components/layout/TopBanner";
import { ApprovalQueue } from "./components/chat/ApprovalQueue";
import { CommandApprovalModal } from "./components/chat/CommandApprovalModal";
import { HandoffBanner } from "./components/chat/HandoffBanner";
import { ThreadTurns } from "./components/chat/ThreadTurns";
import { ActivityDrawer } from "./components/activity/ActivityDrawer";
import { DigitalTwinPanel } from "./components/inspector/DigitalTwinPanel";
import { ReflectionPanel } from "./components/inspector/ReflectionPanel";
import { TrustPolicyEditor } from "./components/inspector/TrustPolicyEditor";
import { MemoryGraphPanel } from "./components/orchestration/MemoryGraphPanel";
import { PlanReviewModal } from "./components/orchestration/PlanReviewModal";
import { TaskTreePanel } from "./components/orchestration/TaskTreePanel";
import { VerifierPanel } from "./components/orchestration/VerifierPanel";
import { AgentCreatorModal } from "./components/ui/AgentCreatorModal";
import { CommandPalette } from "./components/ui/CommandPalette";
import { useAppStore, useChatStore, useReasoningStore, useRouterStore } from "./store";
import { useOrchestrationStore, usePhase3Store, usePhase4Store } from "./store";



export type AgentSource = "custom" | "connected";
export type SandboxMode = "none" | "read-only" | "workspace-write";
export type WorkspaceView =
  | "chat"
  | "channels"
  | "council"
  | "delegations"
  | "activity"
  | "accounts"
  | "observability";
export type DelegationStatus = "queued" | "active" | "blocked" | "done";
export type DelegationPriority = "low" | "medium" | "high";
export type DelegationExecutionMode = "manual" | "thread" | "command";
export type CommandExecutionSource = "runner" | "delegation" | "agent";
export type PermissionKey = "terminal" | "browser" | "files" | "git" | "delegation";
export type ActivityKind =
  | "thinking"
  | "sandbox"
  | "typing"
  | "delegation"
  | "search"
  | "read"
  | "git"
  | "test"
  | "build"
  | "install"
  | "browser";
export type ChannelStatus = "active" | "blocked" | "done";
export type ChannelMessageKind = "message" | "task" | "handoff" | "result" | "system";
export type PresenceTone = "running" | "review" | "error" | "idle";

export interface AgentPermissions {
  terminal: boolean;
  browser: boolean;
  files: boolean;
  git: boolean;
  delegation: boolean;
}

export interface WorkspaceAgent extends Agent {
  source: AgentSource;
  provider: string;
  model: string;
  objective: string;
  systemPrompt: string;
  specialties: string[];
  tools: string[];
  workspace: string;
  sandboxMode: SandboxMode;
  permissions: AgentPermissions;
}

export interface DelegationTask {
  id: string;
  title: string;
  fromAgentId: string;
  assigneeId: string;
  status: DelegationStatus;
  priority: DelegationPriority;
  notes: string;
  executionMode: DelegationExecutionMode;
  payload: string;
  cwd: string;
  updatedAt: string;
  inputContract?: Record<string, unknown>;
  outputContract?: Record<string, unknown>;
  parentDelegationId?: string | null;
  channelId?: string | null;
  dependencyIds?: string[];
  cancellationReason?: string | null;
}

export interface ChatMessage {
  id: string;
  agentId: string;
  role: "user" | "assistant" | "system";
  sender: string;
  content: string;
  contextText?: string;
  attachmentIds?: string[];
  timestamp: string;
}

export interface CollaborationChannel {
  id: string;
  title: string;
  objective: string;
  leadAgentId: string;
  memberAgentIds: string[];
  memberTargets: Record<string, string>;
  status: ChannelStatus;
  linkedDelegationIds: string[];
  lastSummary: string;
  updatedAt: string;
}

export interface ChannelMessage {
  id: string;
  channelId: string;
  sender: string;
  senderId?: string | null;
  role: "user" | "agent" | "system";
  kind: ChannelMessageKind;
  content: string;
  contextText?: string;
  attachmentIds?: string[];
  timestamp: string;
}

export interface ComposerAttachment {
  id: string;
  name: string;
  mimeType: string;
  kind: "image" | "text" | "document";
  size: number;
  previewUrl?: string;
  textContent?: string;
  warning?: string;
}

export interface CommandRun {
  id: string;
  agentId: string;
  command: string;
  cwd: string;
  status:
    | "queued"
    | "planning"
    | "running"
    | "waiting_for_approval"
    | "blocked"
    | "completed"
    | "failed"
    | "canceled";
  phase?:
    | "queued"
    | "planning"
    | "executing"
    | "waiting_for_approval"
    | "blocked"
    | "completed"
    | "failed"
    | "canceled";
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  durationMs: number | null;
  createdAt: string;
  completedAt?: string | null;
  canceledAt?: string | null;
  runtimeRunId?: string;
  activityKind?: ActivityKind;
  activityLabel?: string;
  activitySummary?: string;
  agentName?: string;
  error?: string;
  retryCount?: number;
  maxRetries?: number;
  parentRunId?: string | null;
  retryOfRunId?: string | null;
  model?: string | null;
  provider?: string | null;
  artifacts?: RuntimeArtifact[] | null;
}

export interface CommandReview {
  status: "safe" | "approval" | "blocked";
  reasons: string[];
}

export interface PendingCommandApproval {
  agentId: string;
  queueId?: string | null;
  command: string;
  cwd: string;
  source: CommandExecutionSource;
  taskId: string | null;
  ownerName: string | null;
  taskTitle: string | null;
  reasons: string[];
  requestedAt: string;
}

export interface ToolApprovalState {
  request: ToolApprovalRequest;
  isResolving: boolean;
  editMode: boolean;
  editedParameters: Record<string, unknown>;
}

export interface AgentExecutionPlan {
  mode: "chat" | "command";
  command: string;
  cwd: string;
  reasoning: string;
}

export interface ExecutionStepResult {
  command: string;
  cwd: string;
  result: {
    ok: boolean;
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    timedOut?: boolean;
    durationMs?: number;
    cwd?: string;
    error?: string;
    artifacts?: RuntimeArtifact[] | null;
  };
}

export interface LiveActivityEntry {
  id: string;
  agentId: string;
  kind: ActivityKind;
  label: string;
  detail: string;
  status: "running" | "completed" | "failed" | "idle";
  timestamp: string;
}

export interface AgentDraft {
  name: string;
  role: string;
  emoji: string;
  provider: string;
  model: string;
  objective: string;
  systemPrompt: string;
  specialties: string;
  skills: string;
  workspace: string;
  sandboxMode: SandboxMode;
  terminal: boolean;
  browser: boolean;
  files: boolean;
  git: boolean;
  delegation: boolean;
}

export interface ChannelDraft {
  title: string;
  objective: string;
  leadAgentId: string;
  memberAgentIds: string[];
  memberTargets: Record<string, string>;
}

export interface DelegationDraft {
  title: string;
  assigneeId: string;
  priority: DelegationPriority;
  notes: string;
  executionMode: DelegationExecutionMode;
  payload: string;
  cwd: string;
  autoDispatch: boolean;
}

export interface GithubDeviceAuthSession {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  verificationUriComplete: string;
  interval: number;
  expiresAt: number;
}

export type WorkspaceAgentRow =
  Database["public"]["Tables"]["workspace_agents"]["Row"];
export type WorkspaceDelegationRow =
  Database["public"]["Tables"]["workspace_delegations"]["Row"];
export type WorkspaceMessageRow =
  Database["public"]["Tables"]["workspace_messages"]["Row"];
export type WorkspaceCommandRunRow =
  Database["public"]["Tables"]["workspace_command_runs"]["Row"];
export type WorkspaceDispatcherDecisionRow =
  Database["public"]["Tables"]["workspace_dispatcher_decisions"]["Row"];
export type WorkspaceContextPackageRow =
  Database["public"]["Tables"]["workspace_context_packages"]["Row"];
export type WorkspaceTaskTreeRow =
  Database["public"]["Tables"]["workspace_task_trees"]["Row"];
export type WorkspaceVerifierReviewRow =
  Database["public"]["Tables"]["workspace_verifier_reviews"]["Row"];
export type WorkspacePlanReviewRow =
  Database["public"]["Tables"]["workspace_plan_reviews"]["Row"];
export type WorkspaceCircuitBreakerEventRow =
  Database["public"]["Tables"]["workspace_circuit_breaker_events"]["Row"];
export type WorkspaceKnowledgeGraphRow =
  Database["public"]["Tables"]["workspace_knowledge_graphs"]["Row"];
export type WorkspaceToolDraftRow =
  Database["public"]["Tables"]["workspace_tool_drafts"]["Row"];

const STORAGE_KEYS = {
  customAgents: "control-room.custom-agents",
  delegations: "control-room.delegations",
  messages: "control-room.messages",
  channels: "control-room.channels",
  channelMessages: "control-room.channel-messages",
  commandRuns: "control-room.command-runs",
  selectedAgentId: "control-room.selected-agent-id",
  selectedChannelId: "control-room.selected-channel-id",
  workspaceView: "control-room.workspace-view",
} as const;

const PERSONAL_WORKSPACE_ID = "default";

const blockedCommandPatterns = [
  /\brm\s+-rf\s+\/\b/i,
  /\bsudo\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\bdd\b/i,
  /\bchmod\s+-R\s+777\b/i,
  /\bchown\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-fd\b/i,
];

const readOnlyCommands = new Set([
  "pwd",
  "ls",
  "cat",
  "head",
  "tail",
  "sed",
  "rg",
  "find",
  "git",
  "wc",
  "stat",
  "which",
  "echo",
]);

const shellRiskPattern = /[|;&><`$]/;

const commandApprovalPatterns = [
  {
    pattern: /\b(rm|mv|cp|mkdir|touch|install|tee)\b/i,
    reason: "It can change files inside the workspace.",
  },
  { pattern: /\bsed\s+-i\b/i, reason: "It edits files in place." },
  {
    pattern: /\bchmod\b|\bchown\b/i,
    reason: "It changes file permissions or ownership.",
  },
  {
    pattern:
      /\bgit\s+(add|commit|checkout|switch|merge|rebase|clean|reset|restore|stash|apply)\b/i,
    reason: "It changes git state or rewrites the working tree.",
  },
  {
    pattern: /\b(npm|pnpm|yarn|bun)\s+(install|add|remove|update|upgrade)\b/i,
    reason: "It changes dependencies or lockfiles.",
  },
  {
    pattern: /\b(pip|pip3|uv)\s+(install|sync|add|remove)\b/i,
    reason: "It changes the Python environment or project state.",
  },
  {
    pattern: /\b(cargo\s+(add|remove)|go\s+get)\b/i,
    reason: "It changes project dependencies.",
  },
  {
    pattern: /\b(curl|wget)\b/i,
    reason: "It pulls external content into the sandbox.",
  },
];

const accentPalette = [
  "#10b981",
  "#38bdf8",
  "#f59e0b",
  "#fb7185",
  "#818cf8",
  "#14b8a6",
];

const statusMeta: Record<
  AgentStatus,
  {
    label: string;
    dotClass: string;
    badgeVariant: "emerald" | "amber" | "danger" | "muted";
  }
> = {
  active: { label: "Active", dotClass: "bg-primary", badgeVariant: "emerald" },
  idle: { label: "Idle", dotClass: "bg-amber-400", badgeVariant: "amber" },
  error: { label: "Error", dotClass: "bg-danger", badgeVariant: "danger" },
  offline: {
    label: "Offline",
    dotClass: "bg-slate-500",
    badgeVariant: "muted",
  },
};

const runStatusMeta: Record<
  string,
  {
    label: string;
    badgeVariant: "emerald" | "amber" | "danger" | "muted" | "cyan";
  }
> = {
  queued: { label: "Queued", badgeVariant: "cyan" },
  planning: { label: "Planning", badgeVariant: "amber" },
  running: { label: "Running", badgeVariant: "amber" },
  waiting_for_approval: { label: "Awaiting Approval", badgeVariant: "amber" },
  blocked: { label: "Blocked", badgeVariant: "danger" },
  completed: { label: "Completed", badgeVariant: "emerald" },
  failed: { label: "Failed", badgeVariant: "danger" },
  canceled: { label: "Canceled", badgeVariant: "muted" },
};

const delegationMeta: Record<
  DelegationStatus,
  { label: string; badgeVariant: "cyan" | "emerald" | "amber" | "muted" }
> = {
  queued: { label: "Queued", badgeVariant: "cyan" },
  active: { label: "Active", badgeVariant: "emerald" },
  blocked: { label: "Blocked", badgeVariant: "amber" },
  done: { label: "Done", badgeVariant: "muted" },
};

const channelMeta: Record<
  ChannelStatus,
  { label: string; badgeVariant: "emerald" | "amber" | "muted" }
> = {
  active: { label: "Active", badgeVariant: "emerald" },
  blocked: { label: "Blocked", badgeVariant: "amber" },
  done: { label: "Done", badgeVariant: "muted" },
};

const priorityMeta: Record<
  DelegationPriority,
  { label: string; badgeVariant: "muted" | "cyan" | "danger" }
> = {
  low: { label: "Low", badgeVariant: "muted" },
  medium: { label: "Medium", badgeVariant: "cyan" },
  high: { label: "High", badgeVariant: "danger" },
};

const executionModeMeta: Record<
  DelegationExecutionMode,
  { label: string; badgeVariant: "muted" | "cyan" | "amber" }
> = {
  manual: { label: "Manual", badgeVariant: "muted" },
  thread: { label: "Thread", badgeVariant: "cyan" },
  command: { label: "Command", badgeVariant: "amber" },
};

const viewItems: Array<{
  id: WorkspaceView;
  label: string;
  icon: typeof MessageCircle;
}> = [
  { id: "chat", label: "Threads", icon: MessageCircle },
  { id: "channels", label: "Channels", icon: Users2 },
  { id: "council", label: "Council", icon: Bot },
  { id: "delegations", label: "Delegations", icon: Workflow },
  { id: "activity", label: "Activity", icon: Activity },
  { id: "accounts", label: "Accounts", icon: Key },
  { id: "observability", label: "Observe", icon: Clock3 },
];

const DEFAULT_AGENT_WORKSPACE = "/Users/vanshsehrawat";
const CONTROL_ROOM_ROOT = "/Users/vanshsehrawat/Desktop/control room";
const PDF_RESUME_GENERATOR_PATH = `${CONTROL_ROOM_ROOT}/scripts/generate_resume_pdf.py`;
const LEGACY_DEFAULT_WORKSPACES = new Set([
  "/workspace/control-room",
  "/Users/vanshsehrawat/Desktop/control room",
]);

function resolveWorkspacePath(
  workspace: string | null | undefined,
  fallback = DEFAULT_AGENT_WORKSPACE,
) {
  const trimmed = (workspace ?? "").trim();
  return !trimmed || LEGACY_DEFAULT_WORKSPACES.has(trimmed)
    ? fallback
    : trimmed;
}

function shellQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function encodePromptForShell(prompt: string) {
  if (typeof window === "undefined") {
    return "";
  }

  return window.btoa(unescape(encodeURIComponent(prompt)));
}

function extractResumeName(prompt: string) {
  const explicitMatch =
    prompt.match(
      /\b(?:i am|my name is)\s+([a-z][a-z\s]+?)(?:\s+in\b|\s+from\b|,|\.|$)/i,
    ) ||
    prompt.match(
      /\bname\s*[:\-]\s*([a-z][a-z\s]+?)(?:\s+in\b|\s+from\b|,|\.|$)/i,
    );

  const candidate = explicitMatch?.[1]?.trim();
  if (!candidate) {
    return "Resume";
  }

  return candidate
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("_");
}

function shouldUseResumePdfSkill(
  prompt: string,
  contextMessages: ChatMessage[] = [],
) {
  const recentContext = contextMessages
    .slice(-8)
    .map((message) => message.contextText || message.content)
    .join("\n\n");
  const normalizedPrompt = prompt.toLowerCase();
  const normalizedContext = recentContext.toLowerCase();
  const combined = `${normalizedContext}\n${normalizedPrompt}`;
  const promptMentionsPdf = /\b(pdf|resume pdf|cv pdf)\b/.test(
    normalizedPrompt,
  );
  const combinedMentionsPdf = /\b(pdf|resume pdf|cv pdf)\b/.test(combined);
  const combinedMentionsResume = /\b(resume|cv)\b/.test(combined);
  const promptWantsCreation =
    /\b(create|generate|make|build|save|export)\b/.test(normalizedPrompt);
  const followUpCreate =
    /\b(run it|do it yourself|create it|make it|save it|generate it|export it)\b/.test(
      normalizedPrompt,
    );

  return (
    (promptMentionsPdf && promptWantsCreation) ||
    (combinedMentionsPdf &&
      combinedMentionsResume &&
      (promptWantsCreation || followUpCreate)) ||
    (combinedMentionsResume &&
      promptWantsCreation &&
      normalizedPrompt.includes("pdf"))
  );
}

function buildResumePdfSkillPlan(
  prompt: string,
  contextMessages: ChatMessage[],
): AgentExecutionPlan {
  const combinedPrompt = contextMessages
    .map((message) => message.contextText || message.content)
    .concat(prompt)
    .filter(Boolean)
    .join("\n\n");
  const outputName = `${extractResumeName(combinedPrompt)}_Resume.pdf`;
  const outputPath = `${DEFAULT_AGENT_WORKSPACE}/Desktop/${outputName}`;
  const encodedPrompt = encodePromptForShell(combinedPrompt);
  const command = [
    "python3",
    shellQuote(PDF_RESUME_GENERATOR_PATH),
    "--output",
    shellQuote(outputPath),
    "--prompt-b64",
    shellQuote(encodedPrompt),
  ].join(" ");

  return {
    mode: "command",
    command,
    cwd: DEFAULT_AGENT_WORKSPACE,
    reasoning:
      "Using the bundled PDF generation skill to create the requested resume PDF on Desktop.",
  };
}

const builtInSkillCatalog: Array<{
  id: string;
  label: string;
  icon: typeof FileText;
  description: string;
  keywords: string[];
  requiredPermissions: PermissionKey[];
}> = [
  {
    id: "pdf",
    label: "PDF generate & review",
    icon: FileText,
    description:
      "Create polished PDFs, inspect existing files, extract content, and review layout-sensitive documents.",
    keywords: ["pdf", "report", "deck", "export", "document"],
    requiredPermissions: ["files"],
  },
  {
    id: "docx",
    label: "DOCX editing",
    icon: ScrollText,
    description:
      "Draft and update Word documents while preserving headings, formatting, and structure.",
    keywords: ["doc", "docx", "word", "proposal", "brief"],
    requiredPermissions: ["files"],
  },
  {
    id: "spreadsheet",
    label: "Spreadsheet analysis",
    icon: FolderOpen,
    description:
      "Create and analyze CSV/XLSX data, formulas, and tabular reports for operations and finance work.",
    keywords: ["sheet", "spreadsheet", "excel", "csv", "xlsx", "table"],
    requiredPermissions: ["files"],
  },
  {
    id: "browser-qa",
    label: "Browser automation",
    icon: Globe,
    description:
      "Run browser-driven QA, UI walkthroughs, screenshots, and page-level workflow checks.",
    keywords: ["playwright", "browser", "qa", "e2e", "ui", "automation"],
    requiredPermissions: ["browser"],
  },
  {
    id: "github",
    label: "GitHub workflows",
    icon: Github,
    description:
      "Inspect repositories, triage PRs, review comments, and manage code-centric collaboration loops.",
    keywords: ["github", "pr", "review", "issue", "ci", "repo"],
    requiredPermissions: ["git"],
  },
  {
    id: "docs-research",
    label: "Docs & web research",
    icon: Globe,
    description:
      "Pull official docs, compare sources, summarize references, and gather current external context.",
    keywords: ["docs", "research", "web", "search", "reference", "compare"],
    requiredPermissions: ["browser"],
  },
  {
    id: "deploy",
    label: "Deployments",
    icon: Workflow,
    description:
      "Ship previews, run deployment flows, and support environment-aware release tasks from the workspace.",
    keywords: ["deploy", "vercel", "release", "preview", "ship"],
    requiredPermissions: ["terminal", "files"],
  },
];

const providerPresets = [
  { label: "OpenAI", provider: "OpenAI", model: "gpt-4.1" },
  { label: "Anthropic", provider: "Anthropic", model: "claude-3-7-sonnet" },
  { label: "Gemini", provider: "Gemini", model: "gemini-2.5-flash" },
  { label: "Groq", provider: "Groq", model: "llama-3.3-70b-versatile" },
  {
    label: "OpenRouter",
    provider: "OpenRouter",
    model: "google/gemini-2.5-pro",
  },
  { label: "GitHub Models", provider: "GitHub", model: "openai/gpt-4.1" },
  {
    label: "Copilot · OpenAI",
    provider: "Copilot",
    model: "gpt-4.1",
    displayModel: "GPT-4.1",
  },
  {
    label: "Copilot · OpenAI",
    provider: "Copilot",
    model: "gpt-5-mini",
    displayModel: "GPT-5 mini",
  },
  {
    label: "Copilot · OpenAI",
    provider: "Copilot",
    model: "gpt-5.1",
    displayModel: "GPT-5.1",
  },
  {
    label: "Copilot · OpenAI",
    provider: "Copilot",
    model: "gpt-5.2",
    displayModel: "GPT-5.2",
  },
  {
    label: "Copilot · OpenAI",
    provider: "Copilot",
    model: "gpt-5.2-codex",
    displayModel: "GPT-5.2-Codex",
  },
  {
    label: "Copilot · OpenAI",
    provider: "Copilot",
    model: "gpt-5.3-codex",
    displayModel: "GPT-5.3-Codex",
  },
  {
    label: "Copilot · OpenAI",
    provider: "Copilot",
    model: "gpt-5.4",
    displayModel: "GPT-5.4",
  },
  {
    label: "Copilot · OpenAI",
    provider: "Copilot",
    model: "gpt-5.4-mini",
    displayModel: "GPT-5.4 mini",
  },
  {
    label: "Copilot · Anthropic",
    provider: "Copilot",
    model: "claude-haiku-4.5",
    displayModel: "Claude Haiku 4.5",
  },
  {
    label: "Copilot · Anthropic",
    provider: "Copilot",
    model: "claude-opus-4.5",
    displayModel: "Claude Opus 4.5",
  },
  {
    label: "Copilot · Anthropic",
    provider: "Copilot",
    model: "claude-opus-4.6",
    displayModel: "Claude Opus 4.6",
  },
  {
    label: "Copilot · Anthropic",
    provider: "Copilot",
    model: "claude-opus-4.6-fast-mode-preview",
    displayModel: "Claude Opus 4.6 (fast mode) (preview)",
  },
  {
    label: "Copilot · Anthropic",
    provider: "Copilot",
    model: "claude-sonnet-4",
    displayModel: "Claude Sonnet 4",
  },
  {
    label: "Copilot · Anthropic",
    provider: "Copilot",
    model: "claude-sonnet-4.5",
    displayModel: "Claude Sonnet 4.5",
  },
  {
    label: "Copilot · Anthropic",
    provider: "Copilot",
    model: "claude-sonnet-4.6",
    displayModel: "Claude Sonnet 4.6",
  },
  {
    label: "Copilot · Google",
    provider: "Copilot",
    model: "gemini-2.5-pro",
    displayModel: "Gemini 2.5 Pro",
  },
  {
    label: "Copilot · Google",
    provider: "Copilot",
    model: "gemini-3-flash",
    displayModel: "Gemini 3 Flash",
  },
  {
    label: "Copilot · Google",
    provider: "Copilot",
    model: "gemini-3.1-pro",
    displayModel: "Gemini 3.1 Pro",
  },
  {
    label: "Copilot · xAI",
    provider: "Copilot",
    model: "grok-code-fast-1",
    displayModel: "Grok Code Fast 1",
  },
  {
    label: "Copilot · Tuned",
    provider: "Copilot",
    model: "raptor-mini",
    displayModel: "Raptor mini",
  },
  {
    label: "Copilot · Tuned",
    provider: "Copilot",
    model: "goldeneye",
    displayModel: "Goldeneye",
  },
] as const;

const emptyAgentDraft: AgentDraft = {
  name: "",
  role: "",
  emoji: "🤖",
  provider: "OpenAI",
  model: "gpt-4.1",
  objective: "",
  systemPrompt: "",
  specialties: "",
  skills: "",
  workspace: DEFAULT_AGENT_WORKSPACE,
  sandboxMode: "workspace-write",
  terminal: true,
  browser: true,
  files: true,
  git: false,
  delegation: true,
};

const GALAXY_AGENT_ID = "galaxy";
const DEFAULT_CHANNEL_LEAD_AGENT_ID = GALAXY_AGENT_ID;
const BUILDER_AGENT_ID = "builder";

const codexStyleBuilderDefaults = {
  subtitle:
    "Acts like a hands-on coding agent with terminal-first execution and concise follow-through.",
  role: "Codex-Style Builder",
  provider: "Copilot",
  model: "gpt-5.3-codex",
  objective:
    "Own implementation work end to end: inspect the workspace, run commands, edit files, install dependencies when needed, and report results with the same practical tone as a strong coding agent.",
  systemPrompt: [
    "You are Builder, the hands-on coding agent for this workspace.",
    "Work like a senior terminal-first software engineer: inspect the codebase, run commands, edit files, verify results, and keep moving until the task is actually handled.",
    "Default to doing the work yourself instead of only describing it. If a command or code change is the right next step, take it.",
    "Use the assigned workspace directly, prefer fast CLI inspection, and make concrete progress without waiting for unnecessary confirmation.",
    "Ask follow-up questions only when a missing detail creates real risk. Otherwise make a reasonable assumption, continue, and say what you assumed.",
    "When a dependency or tool is needed to complete the job, install or set it up inside the workspace flow instead of stopping to ask first, unless the action is clearly unsafe.",
    "After terminal work, answer crisply: say what you ran, what changed, what the result was, and any remaining risk.",
    "Stay warm, collaborative, and practical. Be concise, grounded in real execution, and avoid generic assistant filler.",
    "Do not delegate unless the user explicitly asks for multi-agent help.",
  ].join("\n\n"),
  skills: [
    "Coding",
    "Terminal execution",
    "Dependency setup",
    "Debugging",
    "PDF generation & review",
  ],
  specialties: [
    "Implementation",
    "Debugging",
    "Terminal execution",
    "Environment setup",
  ],
  tools: ["Terminal", "Files", "Git", "Browser"],
  sandboxMode: "workspace-write" as SandboxMode,
  permissions: {
    terminal: true,
    browser: true,
    files: true,
    git: true,
    delegation: false,
  },
} as const;

const defaultCustomAgents: WorkspaceAgent[] = [
  {
    id: GALAXY_AGENT_ID,
    name: "Galaxy",
    emoji: "🌌",
    subtitle:
      "Your personal command agent for channels, delegation, and follow-through.",
    type: "Custom Agent",
    role: "Personal Orchestrator",
    accent: "#60a5fa",
    status: "active",
    currentActivity:
      "Watching for work that needs a shared room or a specialist handoff",
    lastSeen: "2026-04-15T08:30:00.000Z",
    tasksCompleted: 58,
    accuracy: 96.9,
    skills: [
      "Channel orchestration",
      "Delegation",
      "Review loops",
      "PDF generation & review",
    ],
    source: "custom",
    provider: "Copilot",
    model: "gpt-5.2",
    objective:
      "Act as the default personal agent, decide when a new channel is needed, assign the right specialists, and review the room before reporting back.",
    systemPrompt:
      "You are Galaxy, the default personal orchestrator for this workspace. Stay in the main DM unless a task clearly needs collaboration, then open a focused channel, dispatch the right specialists, review their outputs, and report back crisply.",
    specialties: ["Orchestration", "Task routing", "Cross-agent review"],
    tools: ["Delegation", "Browser", "Files", "Git", "Terminal"],
    workspace: DEFAULT_AGENT_WORKSPACE,
    sandboxMode: "workspace-write",
    permissions: {
      terminal: true,
      browser: true,
      files: true,
      git: true,
      delegation: true,
    },
  },
  {
    id: "architect",
    name: "Architect",
    emoji: "🧠",
    subtitle: "Turns rough ideas into sharp system plans.",
    type: "Custom Agent",
    role: "Product + Systems Lead",
    accent: "#10b981",
    status: "active",
    currentActivity: "Mapping the new multi-agent workspace architecture",
    lastSeen: "2026-04-14T12:12:00.000Z",
    tasksCompleted: 41,
    accuracy: 97.2,
    skills: ["Roadmapping", "Systems design", "Prompt strategy"],
    source: "custom",
    provider: "OpenAI",
    model: "gpt-4.1",
    objective:
      "Own product direction, break work into slices, and decide which specialist should handle each job.",
    systemPrompt:
      "You are the strategic lead of a personal agent workspace. Clarify goals, reduce ambiguity, and hand off concrete tasks to the right specialist.",
    specialties: ["Product thinking", "Architecture", "Delegation"],
    tools: ["Planning", "Delegation", "Workspace context"],
    workspace: DEFAULT_AGENT_WORKSPACE,
    sandboxMode: "workspace-write",
    permissions: {
      terminal: true,
      browser: true,
      files: true,
      git: true,
      delegation: true,
    },
  },
  {
    id: BUILDER_AGENT_ID,
    name: "Builder",
    emoji: "🛠️",
    subtitle: codexStyleBuilderDefaults.subtitle,
    type: "Custom Agent",
    role: codexStyleBuilderDefaults.role,
    accent: "#38bdf8",
    status: "idle",
    currentActivity:
      "Ready to inspect the workspace, run commands, and ship the next coding task",
    lastSeen: "2026-04-14T12:05:00.000Z",
    tasksCompleted: 33,
    accuracy: 95.8,
    skills: [...codexStyleBuilderDefaults.skills],
    source: "custom",
    provider: codexStyleBuilderDefaults.provider,
    model: codexStyleBuilderDefaults.model,
    objective: codexStyleBuilderDefaults.objective,
    systemPrompt: codexStyleBuilderDefaults.systemPrompt,
    specialties: [...codexStyleBuilderDefaults.specialties],
    tools: [...codexStyleBuilderDefaults.tools],
    workspace: DEFAULT_AGENT_WORKSPACE,
    sandboxMode: codexStyleBuilderDefaults.sandboxMode,
    permissions: { ...codexStyleBuilderDefaults.permissions },
  },
  {
    id: "researcher",
    name: "Researcher",
    emoji: "🔎",
    subtitle: "Finds context, comparisons, and outside signal.",
    type: "Custom Agent",
    role: "Research Analyst",
    accent: "#f59e0b",
    status: "idle",
    currentActivity: "Monitoring product inspiration and best practices",
    lastSeen: "2026-04-14T11:58:00.000Z",
    tasksCompleted: 26,
    accuracy: 94.9,
    skills: ["Comparative analysis", "Docs digestion", "Brief writing"],
    source: "custom",
    provider: "Gemini",
    model: "gemini-2.5-pro",
    objective:
      "Pull in external context, summarize alternatives, and feed decision-ready notes back to the workspace.",
    systemPrompt:
      "You are a careful research specialist. Bring in relevant context, compare options clearly, and avoid overclaiming certainty.",
    specialties: ["Competitive analysis", "Documentation", "Synthesis"],
    tools: ["Web", "Planning"],
    workspace: DEFAULT_AGENT_WORKSPACE,
    sandboxMode: "read-only",
    permissions: {
      terminal: false,
      browser: true,
      files: false,
      git: false,
      delegation: true,
    },
  },
  {
    id: "sprinter",
    name: "Sprinter",
    emoji: "⚡",
    subtitle: "Handles fast-turn triage and concise ops help.",
    type: "Custom Agent",
    role: "Realtime Ops Specialist",
    accent: "#14b8a6",
    status: "idle",
    currentActivity: "Waiting for fast-response tasks",
    lastSeen: "2026-04-14T10:12:00.000Z",
    tasksCompleted: 21,
    accuracy: 93.8,
    skills: ["Triage", "Concise summaries", "Ops checklists"],
    source: "custom",
    provider: "Groq",
    model: "llama-3.3-70b-versatile",
    objective:
      "Move quickly on operational questions, short summaries, and fast first-pass drafts.",
    systemPrompt:
      "You are a rapid-response specialist. Keep answers crisp, practical, and immediately useful.",
    specialties: ["Speed", "Operations", "Triage"],
    tools: ["Delegation", "Workspace context"],
    workspace: DEFAULT_AGENT_WORKSPACE,
    sandboxMode: "read-only",
    permissions: {
      terminal: false,
      browser: false,
      files: false,
      git: false,
      delegation: true,
    },
  },
  {
    id: "qa-guard",
    name: "QA Guard",
    emoji: "🛡️",
    subtitle: "Keeps regressions and unsafe changes from slipping through.",
    type: "Custom Agent",
    role: "Quality Reviewer",
    accent: "#fb7185",
    status: "offline",
    currentActivity: "Ready to review before shipping",
    lastSeen: "2026-04-14T10:34:00.000Z",
    tasksCompleted: 17,
    accuracy: 98.1,
    skills: ["Code review", "Edge cases", "Release checks"],
    source: "custom",
    provider: "OpenAI",
    model: "gpt-4.1-mini",
    objective:
      "Review risky changes, find regressions early, and protect the quality bar before release.",
    systemPrompt:
      "You are a quality gate. Prioritize correctness, risks, missing tests, and dangerous assumptions over compliments.",
    specialties: ["Regression review", "Testing gaps", "Risk analysis"],
    tools: ["Files", "Diff review"],
    workspace: DEFAULT_AGENT_WORKSPACE,
    sandboxMode: "read-only",
    permissions: {
      terminal: false,
      browser: false,
      files: true,
      git: true,
      delegation: false,
    },
  },
];

function mergeDefaultCustomAgents(agents: WorkspaceAgent[]) {
  const storedById = new Map(agents.map((agent) => [agent.id, agent]));
  const builtIns = defaultCustomAgents.map((defaultAgent) => {
    const existing = storedById.get(defaultAgent.id);

    if (!existing) {
      return defaultAgent;
    }

    const permissions = {
      ...defaultAgent.permissions,
      ...existing.permissions,
    };

    const mergedAgent = {
      ...defaultAgent,
      ...existing,
      workspace: resolveWorkspacePath(
        existing.workspace,
        defaultAgent.workspace,
      ),
      permissions,
      tools:
        existing.tools && existing.tools.length > 0
          ? uniqueStrings([...defaultAgent.tools, ...existing.tools])
          : deriveTools(permissions),
      specialties:
        existing.specialties && existing.specialties.length > 0
          ? uniqueStrings([
              ...defaultAgent.specialties,
              ...existing.specialties,
            ])
          : defaultAgent.specialties,
      skills:
        existing.skills && existing.skills.length > 0
          ? uniqueStrings([...defaultAgent.skills, ...existing.skills])
          : defaultAgent.skills,
    };

    if (defaultAgent.id !== BUILDER_AGENT_ID) {
      return mergedAgent;
    }

    return {
      ...mergedAgent,
      subtitle: codexStyleBuilderDefaults.subtitle,
      role: codexStyleBuilderDefaults.role,
      provider: codexStyleBuilderDefaults.provider,
      model: codexStyleBuilderDefaults.model,
      objective: codexStyleBuilderDefaults.objective,
      systemPrompt: codexStyleBuilderDefaults.systemPrompt,
      specialties: uniqueStrings([
        ...codexStyleBuilderDefaults.specialties,
        ...(existing?.specialties ?? []),
      ]),
      skills: uniqueStrings([
        ...codexStyleBuilderDefaults.skills,
        ...(existing?.skills ?? []),
      ]),
      tools: uniqueStrings([
        ...codexStyleBuilderDefaults.tools,
        ...(existing?.tools ?? []),
      ]),
      sandboxMode: codexStyleBuilderDefaults.sandboxMode,
      permissions: {
        ...permissions,
        ...codexStyleBuilderDefaults.permissions,
      },
    };
  });

  const extras = agents
    .filter(
      (agent) =>
        !defaultCustomAgents.some(
          (defaultAgent) => defaultAgent.id === agent.id,
        ),
    )
    .map((agent) => ({
      ...agent,
      workspace: resolveWorkspacePath(agent.workspace),
    }));
  return [...builtIns, ...extras];
}

const defaultDelegations: DelegationTask[] = [
  {
    id: "task-shell-redesign",
    title: "Reshape the dashboard into an agent-first workspace",
    fromAgentId: "architect",
    assigneeId: "builder",
    status: "active",
    priority: "high",
    notes:
      "Focus on sidebar agents, thread workspace, and a right-side config panel.",
    executionMode: "thread",
    payload:
      "Take ownership of the workspace redesign. Focus on sidebar agents, thread workspace, and a right-side config panel. Keep the implementation shippable in small steps.",
    cwd: DEFAULT_AGENT_WORKSPACE,
    updatedAt: "2026-04-14T12:18:00.000Z",
  },
  {
    id: "task-nebula-study",
    title: "Study Nebula-style flows and extract the useful patterns",
    fromAgentId: "architect",
    assigneeId: "researcher",
    status: "queued",
    priority: "medium",
    notes: "Focus on custom agents, roles, delegation, and device access.",
    executionMode: "thread",
    payload:
      "Study Nebula-style flows and summarize the strongest product patterns around custom agents, roles, delegation, and device access.",
    cwd: DEFAULT_AGENT_WORKSPACE,
    updatedAt: "2026-04-14T12:09:00.000Z",
  },
  {
    id: "task-release-check",
    title: "Review the first build for risky assumptions before runtime wiring",
    fromAgentId: "builder",
    assigneeId: "qa-guard",
    status: "blocked",
    priority: "medium",
    notes: "Wait until the first agent workspace shell is compiling again.",
    executionMode: "manual",
    payload: "",
    cwd: DEFAULT_AGENT_WORKSPACE,
    updatedAt: "2026-04-14T11:41:00.000Z",
  },
];

const defaultChannels: CollaborationChannel[] = [
  {
    id: "channel-fresh-chat",
    title: "New Channel",
    objective: "",
    leadAgentId: DEFAULT_CHANNEL_LEAD_AGENT_ID,
    memberAgentIds: [DEFAULT_CHANNEL_LEAD_AGENT_ID],
    memberTargets: {
      [DEFAULT_CHANNEL_LEAD_AGENT_ID]: "",
    },
    status: "active",
    linkedDelegationIds: [],
    lastSummary: "",
    updatedAt: "2026-04-15T00:00:00.000Z",
  },
];

const emptyChannelDraft: ChannelDraft = {
  title: "",
  objective: "",
  leadAgentId: DEFAULT_CHANNEL_LEAD_AGENT_ID,
  memberAgentIds: [
    DEFAULT_CHANNEL_LEAD_AGENT_ID,
    "architect",
    "builder",
    "researcher",
  ],
  memberTargets: {},
};

function normalizeChannelTargets(value: unknown, memberAgentIds: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Object.fromEntries(
      memberAgentIds.map((agentId) => [agentId, ""]),
    ) as Record<string, string>;
  }

  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    memberAgentIds.map((agentId) => [
      agentId,
      typeof source[agentId] === "string" ? source[agentId] : "",
    ]),
  ) as Record<string, string>;
}

function normalizeChannel(
  channel: Partial<CollaborationChannel>,
): CollaborationChannel {
  const memberAgentIds = uniqueStrings(
    asStringArray(channel.memberAgentIds ?? [DEFAULT_CHANNEL_LEAD_AGENT_ID]),
  );
  return {
    id: channel.id ?? `channel-${Date.now().toString(36)}`,
    title: channel.title ?? "Untitled Channel",
    objective: channel.objective ?? "",
    leadAgentId: channel.leadAgentId ?? DEFAULT_CHANNEL_LEAD_AGENT_ID,
    memberAgentIds,
    memberTargets: normalizeChannelTargets(
      (channel as { memberTargets?: unknown }).memberTargets,
      memberAgentIds,
    ),
    status:
      channel.status === "blocked" ||
      channel.status === "done" ||
      channel.status === "active"
        ? channel.status
        : "active",
    linkedDelegationIds: uniqueStrings(
      asStringArray(channel.linkedDelegationIds ?? []),
    ),
    lastSummary: channel.lastSummary ?? "",
    updatedAt: channel.updatedAt ?? new Date().toISOString(),
  };
}

function normalizeChannelMessage(
  message: Partial<ChannelMessage>,
  fallbackChannelId: string,
): ChannelMessage {
  return {
    id: message.id ?? `${fallbackChannelId}-message-${Date.now().toString(36)}`,
    channelId: message.channelId ?? fallbackChannelId,
    sender: message.sender ?? "Workspace",
    senderId: typeof message.senderId === "string" ? message.senderId : null,
    role:
      message.role === "user" ||
      message.role === "agent" ||
      message.role === "system"
        ? message.role
        : "system",
    kind:
      message.kind === "task" ||
      message.kind === "handoff" ||
      message.kind === "result" ||
      message.kind === "system" ||
      message.kind === "message"
        ? message.kind
        : "message",
    content: message.content ?? "",
    timestamp: message.timestamp ?? new Date().toISOString(),
  };
}

function normalizeDelegationTask(
  task: Partial<DelegationTask>,
): DelegationTask {
  return {
    id: task.id ?? `delegation-${Date.now().toString(36)}`,
    title: task.title ?? "Untitled delegation",
    fromAgentId: task.fromAgentId ?? "architect",
    assigneeId: task.assigneeId ?? "builder",
    status: task.status ?? "queued",
    priority: task.priority ?? "medium",
    notes: task.notes ?? "",
    executionMode: task.executionMode ?? "manual",
    payload: task.payload ?? "",
    cwd: resolveWorkspacePath(task.cwd),
    channelId: task.channelId ?? null,
    updatedAt: task.updatedAt ?? new Date().toISOString(),
  };
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function asAgentPermissions(value: unknown): AgentPermissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      terminal: false,
      browser: false,
      files: false,
      git: false,
      delegation: false,
    };
  }

  const source = value as Record<string, unknown>;

  return {
    terminal: Boolean(source.terminal),
    browser: Boolean(source.browser),
    files: Boolean(source.files),
    git: Boolean(source.git),
    delegation: Boolean(source.delegation),
  };
}

function mapWorkspaceAgentRow(row: WorkspaceAgentRow): WorkspaceAgent {
  return {
    id: row.id,
    emoji: row.emoji,
    name: row.name,
    subtitle: row.subtitle,
    type: row.type,
    role: row.role,
    accent: row.accent,
    status: row.status as AgentStatus,
    currentActivity: row.current_activity,
    lastSeen: row.last_seen,
    tasksCompleted: row.tasks_completed,
    accuracy: Number(row.accuracy),
    skills: asStringArray(row.skills),
    source: row.source as AgentSource,
    provider: row.provider,
    model: row.model,
    objective: row.objective,
    systemPrompt: row.system_prompt,
    specialties: asStringArray(row.specialties),
    tools: asStringArray(row.tools),
    workspace: resolveWorkspacePath(row.workspace_path),
    sandboxMode: row.sandbox_mode as SandboxMode,
    permissions: asAgentPermissions(row.permissions),
  };
}

function mapWorkspaceDelegationRow(
  row: WorkspaceDelegationRow,
): DelegationTask {
  return normalizeDelegationTask({
    id: row.id,
    title: row.title,
    fromAgentId: row.from_agent_id,
    assigneeId: row.assignee_id,
    status: row.status as DelegationStatus,
    priority: row.priority as DelegationPriority,
    notes: row.notes,
    executionMode: row.execution_mode as DelegationExecutionMode,
    payload: row.payload,
    cwd: row.cwd,
    updatedAt: row.updated_at,
  });
}

function mapWorkspaceCommandRunRow(row: WorkspaceCommandRunRow): CommandRun {
  const validStatuses = new Set([
    "queued",
    "planning",
    "running",
    "waiting_for_approval",
    "blocked",
    "completed",
    "failed",
    "canceled",
  ]);
  const status = validStatuses.has(row.status)
    ? (row.status as CommandRun["status"])
    : "failed";

  return {
    id: row.id,
    agentId: row.agent_id,
    command: row.command,
    cwd: row.cwd,
    status,
    exitCode: row.exit_code,
    stdout: row.stdout,
    stderr: row.stderr,
    timedOut: row.timed_out,
    durationMs: row.duration_ms,
    createdAt: row.created_at,
    completedAt: null,
    canceledAt: null,
    activityKind: "sandbox",
    activityLabel: "Sandbox Run",
    phase: (row as Record<string, unknown>).phase as
      | string
      | undefined as CommandRun["phase"],
    retryCount:
      ((row as Record<string, unknown>).retry_count as number | undefined) ?? 0,
    maxRetries:
      ((row as Record<string, unknown>).max_retries as number | undefined) ?? 3,
    parentRunId:
      ((row as Record<string, unknown>).parent_run_id as
        | string
        | null
        | undefined) ?? null,
    retryOfRunId:
      ((row as Record<string, unknown>).retry_of_run_id as
        | string
        | null
        | undefined) ?? null,
    model:
      ((row as Record<string, unknown>).model as string | null | undefined) ??
      null,
    provider:
      ((row as Record<string, unknown>).provider as
        | string
        | null
        | undefined) ?? null,
  };
}

function decodePayload<T>(value: Json, fallback: T): T {
  if (value === null || value === undefined) {
    return fallback;
  }
  return value as unknown as T;
}

function mapWorkspaceDispatcherDecisionRow(
  row: WorkspaceDispatcherDecisionRow,
): DispatcherDecision {
  return decodePayload(row.payload, {
    id: row.id,
    prompt: "",
    intent: row.intent as DispatcherDecision["intent"],
    lane: row.lane as DispatcherDecision["lane"],
    leadAgentId: row.lead_agent_id,
    collaboratorAgentIds: [],
    matchedAgentIds: [],
    reason: "",
    riskLevel: row.risk_level as DispatcherDecision["riskLevel"],
    complexityScore: row.complexity_score,
    requiresPlanReview: row.requires_plan_review,
    traceSignals: [],
    createdAt: row.created_at,
  });
}

function mapWorkspaceContextPackageRow(
  row: WorkspaceContextPackageRow,
): ContextPackage {
  return decodePayload(row.payload, {
    id: row.id,
    agentId: row.agent_id,
    summary: "",
    globalContext: [],
    channelContext: [],
    agentContext: [],
    provenance: [],
    createdAt: row.created_at,
  });
}

function mapWorkspaceTaskTreeRow(row: WorkspaceTaskTreeRow): TaskTree {
  return decodePayload(row.payload, {
    id: row.id,
    dispatcherDecisionId: row.dispatcher_decision_id,
    rootPrompt: "",
    status: row.status as TaskTree["status"],
    rootAgentId: row.root_agent_id,
    nodes: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  });
}

function mapWorkspaceVerifierReviewRow(
  row: WorkspaceVerifierReviewRow,
): VerifierReview {
  return decodePayload(row.payload, {
    id: row.id,
    agentId: row.agent_id,
    taskTreeId: row.task_tree_id,
    verdict: row.verdict as VerifierReview["verdict"],
    feedback: "",
    attempts: row.attempts,
    candidatePreview: "",
    createdAt: row.created_at,
  });
}

function mapWorkspacePlanReviewRow(row: WorkspacePlanReviewRow): PlanReviewRequest {
  return decodePayload(row.payload, {
    id: row.id,
    title: "Plan review",
    objective: "",
    dispatcherDecisionId: row.dispatcher_decision_id,
    riskLevel: row.risk_level as PlanReviewRequest["riskLevel"],
    steps: [],
    expectedOutcome: "",
    riskAssessment: [],
    status: row.status as PlanReviewRequest["status"],
    createdAt: row.created_at,
  });
}

function mapWorkspaceCircuitBreakerEventRow(
  row: WorkspaceCircuitBreakerEventRow,
): CircuitBreakerEvent {
  return decodePayload(row.payload, {
    id: row.id,
    agentId: row.agent_id,
    reason: "",
    handoffCount: 0,
    triggeredAt: row.triggered_at,
    resolution: row.resolution as CircuitBreakerEvent["resolution"],
  });
}

function mapWorkspaceKnowledgeGraphRow(
  row: WorkspaceKnowledgeGraphRow,
): KnowledgeGraph {
  return decodePayload(row.payload, {
    nodes: [],
    edges: [],
    generatedAt: row.generated_at,
  });
}

function mapWorkspaceToolDraftRow(row: WorkspaceToolDraftRow): ToolDraft {
  return decodePayload(row.payload, {
    id: row.id,
    name: "Generated Tool",
    description: "",
    scriptPath: "",
    language: row.language as ToolDraft["language"],
    status: row.status as ToolDraft["status"],
    validationNotes: [],
    createdAt: row.created_at,
  });
}

function mapRuntimeRunRecord(run: RuntimeCommandRunRecord): CommandRun {
  const validStatuses = new Set([
    "queued",
    "planning",
    "running",
    "waiting_for_approval",
    "blocked",
    "completed",
    "failed",
    "canceled",
  ]);
  const status = validStatuses.has(run.status) ? run.status : "failed";

  return {
    id: run.id,
    agentId: run.agentId,
    agentName: run.agentName,
    command: run.command,
    cwd: run.cwd,
    status,
    phase: run.phase,
    exitCode: typeof run.exitCode === "number" ? run.exitCode : null,
    stdout: run.stdout || "",
    stderr: run.stderr || "",
    timedOut: Boolean(run.timedOut),
    durationMs: typeof run.durationMs === "number" ? run.durationMs : null,
    createdAt: run.startedAt,
    completedAt: run.completedAt || null,
    canceledAt: run.canceledAt || null,
    runtimeRunId: run.id,
    activityKind: toLiveActivityKind(run.activity?.kind),
    activityLabel: run.activity?.label || "Sandbox Run",
    activitySummary: run.activity?.summary || "",
    error: run.error || "",
    retryCount: run.retryCount ?? 0,
    maxRetries: run.maxRetries ?? 3,
    parentRunId: run.parentRunId ?? null,
    retryOfRunId: run.retryOfRunId ?? null,
    model: run.model ?? null,
    provider: run.provider ?? null,
    artifacts: run.artifacts ?? [],
  };
}

function groupWorkspaceMessages(rows: WorkspaceMessageRow[]) {
  const grouped: Record<string, ChatMessage[]> = {};

  rows.forEach((row) => {
    if (!grouped[row.agent_id]) {
      grouped[row.agent_id] = [];
    }

    const message = {
      id: row.id,
      agentId: row.agent_id,
      role: row.role as ChatMessage["role"],
      sender: row.sender,
      content: row.content,
      timestamp: row.message_timestamp,
    };

    if (!isCannedAgentSetupMessage(message)) {
      grouped[row.agent_id].push(message);
    }
  });

  return grouped;
}

function isCannedAgentSetupMessage(message: Pick<ChatMessage, "id" | "content" | "role">) {
  return (
    (message.role === "system" &&
      message.content.includes("local prototype mode")) ||
    message.content.includes("The UI is real, and the agent profile is real") ||
    message.content.includes("My lane is ") ||
    message.content.includes("this thread is ready to become a real execution lane next")
  );
}

function sanitizeMessagesByAgent(
  messagesByAgent: Record<string, ChatMessage[]>,
) {
  let changed = false;
  const sanitized = Object.fromEntries(
    Object.entries(messagesByAgent).map(([agentId, messages]) => {
      const filtered = messages.filter(
        (message) => !isCannedAgentSetupMessage(message),
      );
      if (filtered.length !== messages.length) {
        changed = true;
      }
      return [agentId, filtered];
    }),
  ) as Record<string, ChatMessage[]>;

  return changed ? sanitized : messagesByAgent;
}

function customAgentsSignature(agents: WorkspaceAgent[]) {
  return JSON.stringify(agents);
}

function delegationSignature(tasks: DelegationTask[]) {
  return JSON.stringify(tasks);
}

function messageMapSignature(messagesByAgent: Record<string, ChatMessage[]>) {
  return JSON.stringify(
    Object.entries(messagesByAgent)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([agentId, messages]) => [
        agentId,
        [...messages].sort(
          (left, right) =>
            left.timestamp.localeCompare(right.timestamp) ||
            left.id.localeCompare(right.id),
        ),
      ]),
  );
}

function commandRunsSignature(runs: CommandRun[]) {
  return JSON.stringify(runs);
}

function contextPackagesSignature(contextPackagesByAgent: Record<string, ContextPackage>) {
  return JSON.stringify(
    Object.entries(contextPackagesByAgent).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function taskTreesSignature(taskTrees: TaskTree[]) {
  return JSON.stringify(taskTrees);
}

function verifierReviewsSignature(reviews: VerifierReview[]) {
  return JSON.stringify(reviews);
}

function dispatcherDecisionsSignature(decisions: DispatcherDecision[]) {
  return JSON.stringify(decisions);
}

function planReviewsSignature(reviews: PlanReviewRequest[]) {
  return JSON.stringify(reviews);
}

function circuitBreakerEventsSignature(events: CircuitBreakerEvent[]) {
  return JSON.stringify(events);
}

function knowledgeGraphsSignature(graphsByAgent: Record<string, KnowledgeGraph>) {
  return JSON.stringify(
    Object.entries(graphsByAgent).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

function toolDraftsSignature(drafts: ToolDraft[]) {
  return JSON.stringify(drafts);
}

function parseList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

function toLiveActivityKind(kind?: string): ActivityKind {
  if (
    kind === "search" ||
    kind === "read" ||
    kind === "git" ||
    kind === "test" ||
    kind === "build" ||
    kind === "install" ||
    kind === "delegation" ||
    kind === "thinking" ||
    kind === "typing" ||
    kind === "code.search" ||
    kind === "filesystem.read" ||
    kind === "filesystem.write" ||
    kind === "filesystem.list" ||
    kind === "git.status" ||
    kind === "git.diff" ||
    kind === "git.log" ||
    kind === "shell.exec" ||
    kind === "http.request" ||
    kind === "delegate.task"
  ) {
    if (kind === "code.search") return "search";
    if (kind === "filesystem.read" || kind === "filesystem.list") return "read";
    if (kind === "filesystem.write") return "sandbox";
    if (kind === "git.status" || kind === "git.diff" || kind === "git.log")
      return "git";
    if (kind === "shell.exec") return "sandbox";
    if (kind === "http.request") return "typing";
    if (kind === "delegate.task") return "delegation";

    return kind;
  }

  return "sandbox";
}

function activityBadgeClasses(kind: ActivityKind) {
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

function presenceDotClasses(tone: PresenceTone) {
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

function presenceTextClasses(tone: PresenceTone) {
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

function runIsInFlight(status?: string | null) {
  return (
    status === "queued" ||
    status === "planning" ||
    status === "running" ||
    status === "waiting_for_approval"
  );
}

function runNeedsAttention(status?: string | null) {
  return status === "failed" || status === "blocked" || status === "canceled";
}

function runStatusTone(status?: string | null) {
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

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderMessageHtml(content: string) {
  const raw = marked.parse(content, {
    async: false,
    breaks: true,
    gfm: true,
  }) as string;

  return DOMPurify.sanitize(raw);
}

function isTextLikeMime(type: string) {
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

function looksLikeTextDocument(name: string) {
  return /\.(txt|md|markdown|json|csv|tsv|js|jsx|ts|tsx|py|rb|go|java|c|cpp|h|hpp|css|html|xml|yaml|yml|sql)$/i.test(
    name,
  );
}

function truncateAttachmentText(value: string, limit = 12000) {
  const normalized = value.trim();
  if (normalized.length <= limit) {
    return normalized;
  }

  return `${normalized.slice(0, limit)}\n\n[Truncated after ${limit} characters]`;
}

async function readFileAsDataUrl(file: File) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () =>
      reject(reader.error || new Error(`Failed to read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function readFileAsText(file: File) {
  return await file.text();
}

async function buildComposerAttachment(
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

function buildAttachmentContext(attachments: ComposerAttachment[]) {
  if (attachments.length === 0) {
    return "";
  }

  return [
    "Attached context:",
    ...attachments.map((attachment, index) => {
      if (attachment.kind === "text" && attachment.textContent) {
        return [
          `${index + 1}. ${attachment.name} (${attachment.mimeType || "text"})`,
          attachment.textContent,
        ].join("\n");
      }

      if (attachment.kind === "image") {
        return `${index + 1}. ${attachment.name} (${attachment.mimeType || "image"})\nAn image is attached in the UI for visual reference. The current local runtime may not fully inspect image pixels for every provider yet, so rely on this image when a vision-capable path is available.`;
      }

      return `${index + 1}. ${attachment.name} (${attachment.mimeType || "document"})\n${attachment.warning || "A document is attached for reference."}`;
    }),
  ].join("\n\n");
}

function mergePromptWithAttachments(
  prompt: string,
  attachments: ComposerAttachment[],
) {
  const attachmentContext = buildAttachmentContext(attachments);
  return attachmentContext ? `${prompt}\n\n${attachmentContext}` : prompt;
}

function hasImageAttachments(attachments: ComposerAttachment[]) {
  return attachments.some(
    (attachment) =>
      attachment.kind === "image" && typeof attachment.previewUrl === "string",
  );
}

function withVisionRuntimeAgent(
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

function toRuntimeConversation(
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
    content: message.contextText || message.content,
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

function reviewCommand(
  command: string,
  sandboxMode: SandboxMode,
): CommandReview {
  const trimmedCommand = command.trim();

  if (!trimmedCommand) {
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

  if (sandboxMode === "none") {
    return {
      status: "blocked",
      reasons: ["Sandbox execution is disabled for this agent."],
    };
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

function shouldAutoApproveWorkspaceCommand(agent: WorkspaceAgent) {
  return agent.id === BUILDER_AGENT_ID;
}

function formatCommandReviewContent(
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

function deriveTools(permissions: AgentPermissions) {
  const tools: string[] = [];
  if (permissions.browser) tools.push("Browser & Web");
  if (permissions.terminal) tools.push("Terminal");
  if (permissions.files) tools.push("Files");
  if (permissions.git) tools.push("Git");
  if (permissions.delegation) tools.push("Delegation");
  return tools;
}

function getEnabledToolDefinitions(permissions: AgentPermissions) {
  const enabledToolNames: ToolName[] = [];

  if (permissions.browser) {
    enabledToolNames.push("browser.fetch", "browser.extract", "http.request");
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

function capabilitySummary(permissions: AgentPermissions) {
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

function buildWelcomeThread(agent: WorkspaceAgent): ChatMessage[] {
  void agent;
  return [];
}

function mapLiveAgentToWorkspaceAgent(agent: Agent): WorkspaceAgent {
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

function loadStoredValue<T>(key: string, fallback: T): T {
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

function createDefaultMessages(agents: WorkspaceAgent[]) {
  return Object.fromEntries(
    agents.map((agent) => [agent.id, buildWelcomeThread(agent)]),
  ) as Record<string, ChatMessage[]>;
}

function createDefaultChannelMessages(
  channels: CollaborationChannel[],
  _agents: WorkspaceAgent[],
) {
  return Object.fromEntries(
    channels.map((channel) => {
      return [channel.id, [] satisfies ChannelMessage[]];
    }),
  ) as Record<string, ChannelMessage[]>;
}

function slugifyLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function extractMentionSlugs(text: string) {
  const matches = text.toLowerCase().match(/@[a-z0-9-]+/g) ?? [];
  return uniqueStrings(matches.map((match) => match.slice(1)));
}

function findChannelMentionQuery(text: string) {
  const match = text.match(/(?:^|\s)@([a-z0-9-]*)$/i);
  return match ? match[1].toLowerCase() : null;
}

function insertMentionAtEnd(text: string, slug: string) {
  if (!text.trim()) {
    return `@${slug} `;
  }

  if (/(?:^|\s)@[a-z0-9-]*$/i.test(text)) {
    return text.replace(/@[a-z0-9-]*$/i, `@${slug} `);
  }

  return `${text}${/\s$/.test(text) ? "" : " "}@${slug} `;
}

function buildChannelTaskPrompt(
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

function buildChannelLeadSummary(
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

function buildChannelRoundReview(
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

function toTitleCase(value: string) {
  return value.replace(
    /\w\S*/g,
    (word) => word.charAt(0).toUpperCase() + word.slice(1),
  );
}

function buildGalaxyChannelTitle(prompt: string) {
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

function formatChannelHandle(title: string) {
  return `#${slugifyLabel(title) || "channel"}`;
}

function shouldGalaxyCreateChannel(prompt: string) {
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
    "channel",
    "delegate",
    "assign",
    "handoff",
    "team",
    "agents",
    "collaborate",
    "split this",
    "work on this",
    "need research",
    "need code",
    "need review",
  ];
  const specialistSignals = [
    "build",
    "implement",
    "code",
    "research",
    "scrape",
    "browser",
    "docs",
    "compare",
    "review",
    "test",
    "qa",
    "ship",
    "plan",
    "architecture",
    "refactor",
    "debug",
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

function shouldUseInteractiveBrowser(
  agent: WorkspaceAgent,
  prompt: string,
  browserUseReady: boolean,
) {
  if (!agent.permissions.browser || !browserUseReady) {
    return false;
  }

  const normalized = prompt.toLowerCase();
  const browserSignals = [
    "browse",
    "browser",
    "website",
    "site",
    "web",
    "search",
    "scrape",
    "extract",
    "open",
    "navigate",
    "twitter",
    "x.com",
    "linkedin",
    "reddit",
    "youtube",
  ];

  return browserSignals.some((signal) => normalized.includes(signal));
}

function selectGalaxyChannelMembers(prompt: string, agents: WorkspaceAgent[]) {
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

function buildGalaxyMemberTargets(prompt: string, members: WorkspaceAgent[]) {
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

function inferHandoffAgentsFromText(
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

function pickAccent(index: number) {
  return accentPalette[index % accentPalette.length];
}

function presetDisplayModel(preset: (typeof providerPresets)[number]) {
  return "displayModel" in preset && preset.displayModel
    ? preset.displayModel
    : preset.model;
}

function generateAgentReply(
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

function App() {
  const {
    agents: liveAgents,
    activityFeed,
    aiLogs,
    councilSessions,
    backendError,
    dataMode,
    hasSupabaseConfig,
    startCouncil,
    sendCouncilMessage,
  } = useCommandCenterData();

  const [customAgents, setCustomAgents] = useState<WorkspaceAgent[]>(() =>
    mergeDefaultCustomAgents(
      loadStoredValue(STORAGE_KEYS.customAgents, defaultCustomAgents),
    ),
  );
  const [delegations, setDelegations] = useState<DelegationTask[]>(() =>
    loadStoredValue<DelegationTask[]>(
      STORAGE_KEYS.delegations,
      defaultDelegations,
    ).map(normalizeDelegationTask),
  );
  const [messagesByAgent, setMessagesByAgent] = useState<
    Record<string, ChatMessage[]>
  >(() =>
    sanitizeMessagesByAgent(
      loadStoredValue(
        STORAGE_KEYS.messages,
        createDefaultMessages(defaultCustomAgents),
      ),
    ),
  );
  const [channels, setChannels] = useState<CollaborationChannel[]>(() =>
    defaultChannels.map(normalizeChannel),
  );
  const [channelMessagesById, setChannelMessagesById] = useState<
    Record<string, ChannelMessage[]>
  >(() => createDefaultChannelMessages(defaultChannels, defaultCustomAgents));
  const [selectedAgentId, setSelectedAgentId] = useState<string>(() =>
    loadStoredValue(
      STORAGE_KEYS.selectedAgentId,
      defaultCustomAgents[0]?.id ?? "",
    ),
  );
  const [selectedChannelId, setSelectedChannelId] = useState<string>(
    () => defaultChannels[0]?.id ?? "",
  );
  const [selectedCouncilSessionId, setSelectedCouncilSessionId] =
    useState<string>("");
  const [workspaceView, setWorkspaceView] = useState<WorkspaceView>(() =>
    loadStoredValue(STORAGE_KEYS.workspaceView, "chat" as WorkspaceView),
  );
  const [sidebarWidth, setSidebarWidth] = useState<number>(() =>
    loadStoredValue("control-room.sidebar-width", 278),
  );
  const chatDraft = useChatStore(s => s.chatDraft);
  const setChatDraft = useChatStore(s => s.setChatDraft);
  const chatDraftAttachments = useChatStore(s => s.chatDraftAttachments);
  const setChatDraftAttachments = useChatStore(s => s.setChatDraftAttachments);
  const [chatAttachmentError, setChatAttachmentError] = useState<string | null>(null);
  const channelDraft = useChatStore(s => s.channelDraft);
  const setChannelDraft = useChatStore(s => s.setChannelDraft);
  const channelComposer = useChatStore(s => s.channelComposer);
  const setChannelComposer = useChatStore(s => s.setChannelComposer);
  const councilDraft = useChatStore(s => s.councilDraft);
  const setCouncilDraft = useChatStore(s => s.setCouncilDraft);
  const councilReplyDraft = useChatStore(s => s.councilReplyDraft);
  const setCouncilReplyDraft = useChatStore(s => s.setCouncilReplyDraft);
  const channelDraftAttachments = useChatStore(s => s.channelDraftAttachments);
  const setChannelDraftAttachments = useChatStore(s => s.setChannelDraftAttachments);
  const [channelAttachmentError, setChannelAttachmentError] = useState<
    string | null
  >(null);
  const isCreateAgentOpen = useAppStore(s => s.isCreateAgentOpen);
  const setIsCreateAgentOpen = useAppStore(s => s.setIsCreateAgentOpen);
  const editingAgentId = useAppStore(s => s.editingAgentId);
  const setEditingAgentId = useAppStore(s => s.setEditingAgentId);
  const isCreateChannelOpen = useAppStore(s => s.isCreateChannelOpen);
  const setIsCreateChannelOpen = useAppStore(s => s.setIsCreateChannelOpen);
  const isDelegationOpen = useAppStore(s => s.isDelegationOpen);
  const setIsDelegationOpen = useAppStore(s => s.setIsDelegationOpen);
  const showAllProviderPresets = useAppStore(s => s.showAllProviderPresets);
  const setShowAllProviderPresets = useAppStore(s => s.setShowAllProviderPresets);
  const [isReplying, setIsReplying] = useState(false);
  const [replyingAgentId, setReplyingAgentId] = useState<string | null>(null);
  const [isChannelCollaborating, setIsChannelCollaborating] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [runtimeHealth, setRuntimeHealth] = useState<RuntimeHealth>(() =>
    hasAgentRuntime
      ? { ok: false, error: "Checking local runtime..." }
      : { ok: false, error: "disabled" },
  );
  const isCopilotAuthDialogOpen = useAppStore(s => s.isCopilotAuthDialogOpen);
  const setIsCopilotAuthDialogOpen = useAppStore(s => s.setIsCopilotAuthDialogOpen);
  const [copilotAuthSession, setCopilotAuthSession] =
    useState<GithubDeviceAuthSession | null>(null);
  const [copilotAuthError, setCopilotAuthError] = useState<string | null>(null);
  const [isStartingCopilotAuth, setIsStartingCopilotAuth] = useState(false);
  const [isPollingCopilotAuth, setIsPollingCopilotAuth] = useState(false);
  const [agentDraft, setAgentDraft] = useState<AgentDraft>(emptyAgentDraft);
  const [commandRuns, setCommandRuns] = useState<CommandRun[]>(() =>
    loadStoredValue(STORAGE_KEYS.commandRuns, [] as CommandRun[]),
  );
  const [commandDraft, setCommandDraft] = useState("");
  const [commandCwdDraft, setCommandCwdDraft] = useState("");
  const [isExecutingCommand, setIsExecutingCommand] = useState(false);
  const [commandError, setCommandError] = useState<string | null>(null);
  const [councilError, setCouncilError] = useState<string | null>(null);
  const [isStartingCouncil, setIsStartingCouncil] = useState(false);
  const [isSendingCouncilMessage, setIsSendingCouncilMessage] = useState(false);
  const [pendingCommandApproval, setPendingCommandApproval] =
    useState<PendingCommandApproval | null>(null);
  const [isProcessingCommandApproval, setIsProcessingCommandApproval] =
    useState(false);
  const [toolApproval, setToolApproval] = useState<ToolApprovalState | null>(
    null,
  );
  const [toolInvocationResults, setToolInvocationResults] = useState<
    ToolInvocationResult[]
  >([]);
  const [delegationDraft, setDelegationDraft] = useState<DelegationDraft>({
    title: "",
    assigneeId: "",
    priority: "medium",
    notes: "",
    executionMode: "thread",
    payload: "",
    cwd: DEFAULT_AGENT_WORKSPACE,
    autoDispatch: false,
  });
  const [liveActivityEntries, setLiveActivityEntries] = useState<
    LiveActivityEntry[]
  >([]);
  const [activityToast, setActivityToast] = useState<{id:string; label:string} | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [runtimeRuns, setRuntimeRuns] = useState<CommandRun[]>([]);
  const [runtimeRunsError, setRuntimeRunsError] = useState<string | null>(null);
  const [isLoadingRuntimeRuns, setIsLoadingRuntimeRuns] = useState(false);
  const [selectedActivityRunId, setSelectedActivityRunId] = useState<
    string | null
  >(null);
  const [isMutatingRunId, setIsMutatingRunId] = useState<string | null>(null);
  const isActivityDrawerOpen = useAppStore(s => s.isActivityDrawerOpen);
  const setIsActivityDrawerOpen = useAppStore(s => s.setIsActivityDrawerOpen);
  const activityDrawerTab = useAppStore(s => s.activityDrawerTab);
  const setActivityDrawerTab = useAppStore(s => s.setActivityDrawerTab);
  const selectedFilePreviewPath = useAppStore(s => s.selectedFilePreviewPath);
  const setSelectedFilePreviewPath = useAppStore(s => s.setSelectedFilePreviewPath);
  const setIsCommandPaletteOpen = useAppStore(s => s.setIsCommandPaletteOpen);
  const threadTurnsByAgent = useRouterStore(s => s.threadTurnsByAgent);
  const setThreadTurnsByAgent = useRouterStore(s => s.setThreadTurnsByAgent);
  const latestChannelDecisionById = useRouterStore(
    (s) => s.latestChannelDecisionById,
  );
  const setLatestChannelDecisionById = useRouterStore(
    (s) => s.setLatestChannelDecisionById,
  );
  const latestThoughtByAgentId = useReasoningStore(
    (s) => s.latestThoughtByAgentId,
  );
  const setLatestThoughtByAgentId = useReasoningStore(
    (s) => s.setLatestThoughtByAgentId,
  );
  const latestCriticByAgentId = useReasoningStore(
    (s) => s.latestCriticByAgentId,
  );
  const setLatestCriticByAgentId = useReasoningStore(
    (s) => s.setLatestCriticByAgentId,
  );
  const latestMemoryByAgentId = useReasoningStore(
    (s) => s.latestMemoryByAgentId,
  );
  const setLatestMemoryByAgentId = useReasoningStore(
    (s) => s.setLatestMemoryByAgentId,
  );
  const setContextStats = usePhase3Store((s) => s.setContextStats);
  const enqueueApproval = usePhase3Store((s) => s.enqueueApproval);
  const resolveApprovalQueueItem = usePhase3Store((s) => s.resolveApproval);
  const dismissApprovalQueueItem = usePhase3Store((s) => s.dismissApproval);
  const digitalTwinProfile = usePhase4Store((s) => s.digitalTwinProfile);
  const addLearningEvent = usePhase4Store((s) => s.addLearningEvent);
  const enqueueHandoff = usePhase4Store((s) => s.enqueueHandoff);
  const setPendingBlueprint = usePhase4Store((s) => s.setPendingBlueprint);
  const setIsAgentCreatorOpen = usePhase4Store((s) => s.setIsAgentCreatorOpen);
  const dispatcherDecisions = useOrchestrationStore(
    (s) => s.dispatcherDecisions,
  );
  const addDispatcherDecision = useOrchestrationStore(
    (s) => s.addDispatcherDecision,
  );
  const hydrateOrchestrationFromRemote = useOrchestrationStore(
    (s) => s.hydrateFromRemote,
  );
  const contextPackagesByAgent = useOrchestrationStore(
    (s) => s.contextPackagesByAgent,
  );
  const setContextPackage = useOrchestrationStore((s) => s.setContextPackage);
  const taskTrees = useOrchestrationStore((s) => s.taskTrees);
  const upsertTaskTree = useOrchestrationStore((s) => s.upsertTaskTree);
  const updateTaskTree = useOrchestrationStore((s) => s.updateTaskTree);
  const verifierReviews = useOrchestrationStore((s) => s.verifierReviews);
  const addVerifierReview = useOrchestrationStore((s) => s.addVerifierReview);
  const planReviews = useOrchestrationStore((s) => s.planReviews);
  const upsertPlanReview = useOrchestrationStore((s) => s.upsertPlanReview);
  const resolvePlanReview = useOrchestrationStore((s) => s.resolvePlanReview);
  const circuitBreakerEvents = useOrchestrationStore(
    (s) => s.circuitBreakerEvents,
  );
  const addCircuitBreakerEvent = useOrchestrationStore(
    (s) => s.addCircuitBreakerEvent,
  );
  const knowledgeGraphByAgent = useOrchestrationStore(
    (s) => s.knowledgeGraphByAgent,
  );
  const setKnowledgeGraph = useOrchestrationStore((s) => s.setKnowledgeGraph);
  const toolDrafts = useOrchestrationStore((s) => s.toolDrafts);
  const [selectedTaskTreeId, setSelectedTaskTreeId] = useState<string | null>(
    null,
  );
  const [activePlanReviewId, setActivePlanReviewId] = useState<string | null>(
    null,
  );

  // Global Cmd+K / Ctrl+K keyboard shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [setIsCommandPaletteOpen]);
  const [workspaceSyncMode, setWorkspaceSyncMode] = useState<
    "local" | "syncing" | "live" | "fallback"
  >(supabaseClient ? "syncing" : "local");
  const [workspaceSyncError, setWorkspaceSyncError] = useState<string | null>(
    null,
  );
  const [orchestrationSyncMode, setOrchestrationSyncMode] = useState<
    "local" | "syncing" | "live" | "fallback"
  >(supabaseClient ? "syncing" : "local");
  const [orchestrationSyncError, setOrchestrationSyncError] = useState<
    string | null
  >(null);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [automationRunsById, setAutomationRunsById] = useState<
    Record<string, AutomationRun[]>
  >({});
  const [automationError, setAutomationError] = useState<string | null>(null);
  const [isLoadingAutomations, setIsLoadingAutomations] = useState(false);
  const [isTriggeringAutomationId, setIsTriggeringAutomationId] = useState<
    string | null
  >(null);
  const [attachmentLibrary, setAttachmentLibrary] = useState<
    Record<string, ComposerAttachment>
  >({});
  const workspacePersistenceReadyRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isResizingSidebarRef = useRef(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const channelFileInputRef = useRef<HTMLInputElement>(null);

  // ── Browser Use session state ──────────────────────────────────────
  const [browserSessions, setBrowserSessions] = useState<BrowserUseSession[]>(
    [],
  );
  const [isBrowserSessionLoading, setIsBrowserSessionLoading] = useState(false);
  const [browserSessionError, setBrowserSessionError] = useState<string | null>(
    null,
  );
  const [browserTaskDraft, setBrowserTaskDraft] = useState("");
  const [activeBrowserSessionId, setActiveBrowserSessionId] = useState<
    string | null
  >(null);
  const browserPollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const activeBrowserSession = useMemo(
    () => browserSessions.find((s) => s.id === activeBrowserSessionId) ?? null,
    [browserSessions, activeBrowserSessionId],
  );

  // Fetch browser sessions on tab open
  useEffect(() => {
    if (activityDrawerTab !== "browser" || !hasAgentRuntime) return;
    let cancelled = false;
    (async () => {
      const result = await listBrowserUseSessions();
      if (!cancelled && result.ok && result.sessions) {
        setBrowserSessions(result.sessions);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activityDrawerTab]);

  useEffect(() => {
    void refreshAutomations();
  }, []);

  useEffect(() => {
    if (automations.length === 0) {
      setAutomationRunsById({});
      return;
    }

    let cancelled = false;

    (async () => {
      const results = await Promise.all(
        automations.map(async (automation) => {
          const runs = await listAutomationRuns(automation.id);
          return [automation.id, runs.ok ? runs.runs ?? [] : []] as const;
        }),
      );

      if (cancelled) {
        return;
      }

      setAutomationRunsById(
        results.reduce<Record<string, AutomationRun[]>>((accumulator, [id, runs]) => {
          accumulator[id] = runs;
          return accumulator;
        }, {}),
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [automations]);

  // Poll active session for status updates
  useEffect(() => {
    if (browserPollRef.current) {
      clearInterval(browserPollRef.current);
      browserPollRef.current = null;
    }
    if (!activeBrowserSessionId) return;
    browserPollRef.current = setInterval(async () => {
      const result = await getBrowserUseSession(activeBrowserSessionId);
      if (result.ok && result.session) {
        setBrowserSessions((prev) =>
          prev.map((s) => (s.id === result.session!.id ? result.session! : s)),
        );
        if (
          result.session.status === "completed" ||
          result.session.status === "stopped" ||
          result.session.status === "failed"
        ) {
          if (browserPollRef.current) clearInterval(browserPollRef.current);
          browserPollRef.current = null;
        }
      }
    }, 4000);
    return () => {
      if (browserPollRef.current) clearInterval(browserPollRef.current);
    };
  }, [activeBrowserSessionId]);

  async function handleCreateBrowserSession() {
    if (!browserTaskDraft.trim() || !selectedAgent) return;
    setIsBrowserSessionLoading(true);
    setBrowserSessionError(null);
    try {
      const result = await createBrowserUseSession({
        task: browserTaskDraft.trim(),
        agentId: selectedAgent.id,
        agentName: selectedAgent.name,
      });
      if (result.ok && result.session) {
        setBrowserSessions((prev) => [result.session!, ...prev]);
        setActiveBrowserSessionId(result.session.id);
        setBrowserTaskDraft("");
      } else {
        setBrowserSessionError(result.error || "Failed to create session");
      }
    } catch (err) {
      setBrowserSessionError(
        err instanceof Error ? err.message : "Unknown error",
      );
    } finally {
      setIsBrowserSessionLoading(false);
    }
  }

  async function handleStopBrowserSession(sessionId: string) {
    try {
      const result = await stopBrowserUseSession(sessionId);
      if (result.ok && result.session) {
        setBrowserSessions((prev) =>
          prev.map((s) => (s.id === sessionId ? result.session! : s)),
        );
      }
    } catch {}
  }

  async function launchBrowserSessionForAgent(input: {
    agent: WorkspaceAgent;
    prompt: string;
    focusDrawer?: boolean;
  }) {
    const startedAt = new Date().toISOString();
    const activityId = `${input.agent.id}-browser-${Date.now().toString(36)}`;

    pushLiveActivity({
      id: activityId,
      agentId: input.agent.id,
      kind: "browser",
      label: "Launching Browser",
      detail: input.prompt,
      status: "running",
      timestamp: startedAt,
    });

    const result = await createBrowserUseSession({
      task: input.prompt,
      agentId: input.agent.id,
      agentName: input.agent.name,
    });

    if (!result.ok || !result.session) {
      updateLiveActivity(activityId, (entry) => ({
        ...entry,
        status: "failed",
        detail: result.error || "Browser session failed to launch.",
        timestamp: new Date().toISOString(),
      }));

      return {
        ok: false,
        text: result.error || "Browser session failed to launch.",
      };
    }

    setBrowserSessions((prev) => [
      result.session!,
      ...prev.filter((session) => session.id !== result.session!.id),
    ]);
    setActiveBrowserSessionId(result.session.id);

    if (input.focusDrawer) {
      setActivityDrawerTab("browser");
      setIsActivityDrawerOpen(true);
    }

    updateLiveActivity(activityId, (entry) => ({
      ...entry,
      status: "completed",
      detail: result.session?.liveUrl
        ? `Browser session live: ${result.session.liveUrl}`
        : "Browser session launched.",
      timestamp: new Date().toISOString(),
    }));

    return {
      ok: true,
      session: result.session,
      text: [
        `I opened a live browser session for this task.`,
        result.session.liveUrl
          ? "Open the Browser tab in the activity drawer to watch it live."
          : "The browser session is running and will appear in the Browser tab.",
        `Task: ${input.prompt}`,
      ].join("\n\n"),
    };
  }

  function buildBrowserSessionContextMessage(browserLaunch: {
    ok: boolean;
    text: string;
    session?: BrowserUseSession;
  }): RuntimeChatMessage {
    if (browserLaunch.ok && browserLaunch.session) {
      return {
        role: "system",
        content: [
          "A Browser Use session was launched for this task.",
          "The live browser is secondary. Still provide the user with a normal, useful answer in chat.",
          browserLaunch.session.liveUrl
            ? `Live browser URL: ${browserLaunch.session.liveUrl}`
            : "A live browser URL was not returned, but the browser session was created.",
        ].join("\n\n"),
      };
    }

    return {
      role: "system",
      content: [
        "A Browser Use session was requested but did not launch successfully.",
        "Continue helping in chat anyway and do not stop at the browser error.",
        `Launch error: ${browserLaunch.text}`,
      ].join("\n\n"),
    };
  }

  function extractHttpUrls(text: string) {
    return Array.from(
      new Set(
        (text.match(/https?:\/\/[^\s)]+/gi) ?? []).map((url) =>
          url.replace(/[),.!?]+$/g, ""),
        ),
      ),
    ).slice(0, 3);
  }

  function normalizeWebResearchQuery(prompt: string) {
    const cleaned = prompt
      .replace(/@[a-z0-9-]+/gi, " ")
      .replace(
        /\b(hey|please|researcher|galaxy|search|browse|research|look up|look for|find)\b/gi,
        " ",
      )
      .replace(/\b(on the web|the web|online)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim();

    return cleaned || prompt.trim();
  }

  async function invokeToolWithAutoApproval(
    input: Parameters<typeof invokeTool>[0],
  ): Promise<ToolInvocationResult> {
    const initialResult = await invokeTool(input);
    if (!initialResult.approvalRequired || !initialResult.approvalRequestId) {
      return initialResult;
    }

    const approvalResult = await resolveToolApproval({
      approvalRequestId: initialResult.approvalRequestId,
      action: "approve",
    });

    if (!approvalResult.ok || !approvalResult.result) {
      return {
        ok: false,
        tool: input.tool,
        error: approvalResult.error || "Tool approval failed.",
      };
    }

    return approvalResult.result;
  }

  async function collectLiveWebResearch(input: {
    agent: WorkspaceAgent;
    prompt: string;
    activityId?: string;
  }): Promise<RuntimeChatMessage | null> {
    if (!input.agent.permissions.browser) {
      return null;
    }

    const directUrls = extractHttpUrls(input.prompt);
    const query = normalizeWebResearchQuery(input.prompt);
    const wantsNews = /\b(latest|news|headlines|today|current|recent)\b/i.test(
      input.prompt,
    );
    const targets =
      directUrls.length > 0
        ? directUrls.map((url) => ({ label: url, url }))
        : [
            ...(wantsNews
              ? [
                  {
                    label: "Google News RSS",
                    url: `https://news.google.com/rss/search?q=${encodeURIComponent(query)}`,
                  },
                ]
              : []),
            {
              label: "DuckDuckGo Search",
              url: `https://duckduckgo.com/html/?q=${encodeURIComponent(query)}`,
            },
          ];

    const excerpts: Array<{ label: string; url: string; text: string }> = [];

    for (const target of targets.slice(0, 2)) {
      if (input.activityId) {
        updateLiveActivity(input.activityId, (entry) => ({
          ...entry,
          status: "running",
          detail: `Reading live web context from ${target.label}...`,
          timestamp: new Date().toISOString(),
        }));
      }

      const result = await invokeToolWithAutoApproval({
        tool: "browser.extract",
        agentId: input.agent.id,
        workspacePath: input.agent.workspace || undefined,
        sandboxMode: input.agent.sandboxMode,
        parameters: {
          url: target.url,
          maxChars: 9000,
          timeout: 30000,
        },
      });

      if (result.ok && result.data) {
        const extractedText =
          typeof result.data.text === "string" ? result.data.text.trim() : "";
        if (extractedText) {
          excerpts.push({
            label: target.label,
            url: target.url,
            text: extractedText.slice(0, 5000),
          });
        }
      }
    }

    if (excerpts.length === 0) {
      return null;
    }

    return {
      role: "system",
      content: [
        "Live web research is available for this reply.",
        "Do not say that you lack browsing or live web access.",
        "Use the extracted context below to answer directly, and mention source URLs when relevant.",
        ...excerpts.map(
          (excerpt, index) =>
            `Source ${index + 1}: ${excerpt.label}\nURL: ${excerpt.url}\nExtracted text:\n${excerpt.text}`,
        ),
      ].join("\n\n"),
    };
  }

  function withLiveWebContextPrompt(
    agent: WorkspaceAgent,
    options: {
      hasBrowserLane: boolean;
      hasLiveResearch: boolean;
    },
  ): WorkspaceAgent {
    if (!options.hasBrowserLane && !options.hasLiveResearch) {
      return agent;
    }

    return {
      ...agent,
      systemPrompt: [
        agent.systemPrompt,
        "You are replying in a workspace that has browser capability.",
        options.hasLiveResearch
          ? "Live web context has been provided below. Use it directly and do not claim you lack browsing or live web access."
          : "A browser lane was requested for this task. If live findings are unavailable, say the fetch/browser run did not return usable results rather than claiming browsing is unavailable in principle.",
        "Never ask the user to paste links if live web context is already available in the conversation.",
        "If the topic is fast-moving, be explicit about what the provided sources say and keep uncertainty tied to the sources, not to your access.",
      ]
        .filter(Boolean)
        .join("\n\n"),
    };
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesByAgent, selectedAgentId, replyingAgentId]);

  const workspaceSyncSignatureRef = useRef({
    customAgents: "",
    delegations: "",
    messages: "",
    commandRuns: "",
  });
  const orchestrationPersistenceReadyRef = useRef(false);
  const orchestrationSyncSignatureRef = useRef({
    dispatcherDecisions: "",
    contextPackages: "",
    taskTrees: "",
    verifierReviews: "",
    planReviews: "",
    circuitBreakerEvents: "",
    knowledgeGraphs: "",
    toolDrafts: "",
  });

  const connectedAgents = useMemo(() => {
    const customIds = new Set(customAgents.map((agent) => agent.id));
    return liveAgents
      .map(mapLiveAgentToWorkspaceAgent)
      .filter((agent) => !customIds.has(agent.id));
  }, [customAgents, liveAgents]);

  const allAgents = useMemo(
    () => [...customAgents, ...connectedAgents],
    [connectedAgents, customAgents],
  );

  const selectedAgent = useMemo(
    () =>
      allAgents.find((agent) => agent.id === selectedAgentId) ??
      allAgents[0] ??
      null,
    [allAgents, selectedAgentId],
  );
  const selectedChannel = useMemo(
    () =>
      channels.find((channel) => channel.id === selectedChannelId) ??
      channels[0] ??
      null,
    [channels, selectedChannelId],
  );
  const selectedCouncilSession = useMemo(
    () =>
      councilSessions.find(
        (session) => session.id === selectedCouncilSessionId,
      ) ??
      councilSessions[0] ??
      null,
    [councilSessions, selectedCouncilSessionId],
  );

  const selectedThread = selectedAgent
    ? (messagesByAgent[selectedAgent.id] ?? [])
    : [];
  const selectedThreadTurns = selectedAgent
    ? (threadTurnsByAgent[selectedAgent.id] ?? [])
    : [];
  const selectedChannelMessages = selectedChannel
    ? (channelMessagesById[selectedChannel.id] ?? [])
    : [];
  const latestSelectedThreadTurn =
    selectedThreadTurns.length > 0
      ? selectedThreadTurns[selectedThreadTurns.length - 1]
      : null;
  const latestSelectedChannelDecision = selectedChannel
      ? latestChannelDecisionById[selectedChannel.id] ?? null
      : null;

  useEffect(() => {
    if (!selectedAgent) {
      return;
    }

    const runtimeMessages = toRuntimeConversation(
      selectedThread,
      attachmentLibrary,
    );
    const stats = estimateContextUsage(runtimeMessages);
    setContextStats(selectedAgent.id, stats);
  }, [attachmentLibrary, selectedAgent, selectedThread, setContextStats]);
  const agentDraftCapabilityGroups = useMemo(
    () =>
      capabilitySummary({
        terminal: agentDraft.terminal,
        browser: agentDraft.browser,
        files: agentDraft.files,
        git: agentDraft.git,
        delegation: agentDraft.delegation,
      }),
    [
      agentDraft.browser,
      agentDraft.delegation,
      agentDraft.files,
      agentDraft.git,
      agentDraft.terminal,
    ],
  );
  const activeDelegationCount = delegations.filter(
    (task) => task.status === "active",
  ).length;
  const terminalReadyCount = allAgents.filter(
    (agent) => agent.permissions.terminal,
  ).length;
  const selectedChannelDelegations = useMemo(() => {
    if (!selectedChannel) {
      return [];
    }

    return delegations.filter(
      (task) =>
        task.channelId === selectedChannel.id ||
        selectedChannel.linkedDelegationIds.includes(task.id),
    );
  }, [delegations, selectedChannel]);
  const selectedChannelMembers = useMemo(() => {
    if (!selectedChannel) {
      return [];
    }

    return selectedChannel.memberAgentIds
      .map((agentId) => allAgents.find((agent) => agent.id === agentId))
      .filter(Boolean) as WorkspaceAgent[];
  }, [allAgents, selectedChannel]);
  const channelMentionQuery = useMemo(
    () => findChannelMentionQuery(channelComposer),
    [channelComposer],
  );
  const channelMentionCandidates = useMemo(() => {
    if (!channelMentionQuery) {
      return [];
    }

    return selectedChannelMembers.filter((agent) => {
      const slug = slugifyLabel(agent.name);
      return (
        slug.includes(channelMentionQuery) ||
        agent.name.toLowerCase().includes(channelMentionQuery)
      );
    });
  }, [channelMentionQuery, selectedChannelMembers]);
  const sortedProviderPresets = useMemo(() => {
    return [...providerPresets].sort((left, right) => {
      const leftMatches = left.provider === agentDraft.provider ? 1 : 0;
      const rightMatches = right.provider === agentDraft.provider ? 1 : 0;

      if (leftMatches !== rightMatches) {
        return rightMatches - leftMatches;
      }

      return `${left.label} ${presetDisplayModel(left)}`.localeCompare(
        `${right.label} ${presetDisplayModel(right)}`,
      );
    });
  }, [agentDraft.provider]);
  const visibleProviderPresets = showAllProviderPresets
    ? sortedProviderPresets
    : sortedProviderPresets.slice(0, 10);

  const workspaceActivity = useMemo(() => {
    if (activityFeed.length > 0) {
      return activityFeed.slice(0, 8).map((item) => ({
        id: item.id,
        title: item.action,
        actorId: item.agentId,
        timestamp: item.timestamp,
      }));
    }

    return delegations.slice(0, 8).map((task) => ({
      id: task.id,
      title: `${task.title} is ${delegationMeta[task.status].label.toLowerCase()}`,
      actorId: task.assigneeId,
      timestamp: task.updatedAt,
    }));
  }, [activityFeed, delegations]);

  async function refreshRuntimeHealth() {
    if (!hasAgentRuntime) {
      return { ok: false, error: "disabled" } as RuntimeHealth;
    }

    const nextHealth = await getAgentRuntimeHealth();
    setRuntimeHealth(nextHealth);
    return nextHealth;
  }

  async function refreshAutomations() {
    if (!hasAgentRuntime) {
      setAutomations([]);
      return;
    }

    setIsLoadingAutomations(true);
    const result = await listAutomations();
    setIsLoadingAutomations(false);

    if (!result.ok || !result.automations) {
      setAutomationError(result.error || "Failed to load automations.");
      return;
    }

    setAutomations(result.automations);
    setAutomationError(null);
  }

  async function handleTriggerAutomation(automationId: string) {
    setIsTriggeringAutomationId(automationId);
    const result = await triggerAutomation(automationId);
    setIsTriggeringAutomationId(null);

    if (!result.ok) {
      setAutomationError(result.error || "Failed to trigger automation.");
      return;
    }

    const runs = await listAutomationRuns(automationId);
    if (runs.ok && runs.runs) {
      setAutomationRunsById((current) => ({
        ...current,
        [automationId]: runs.runs ?? [],
      }));
    }

    void refreshAutomations();
  }

  async function refreshRuntimeRuns(agentId?: string) {
    if (!hasAgentRuntime) {
      return;
    }

    setIsLoadingRuntimeRuns(true);
    const result = await listAgentRuntimeRuns({
      agentId,
      limit: agentId ? 16 : 40,
    });
    setIsLoadingRuntimeRuns(false);

    if (!result.ok || !result.runs) {
      setRuntimeRunsError(result.error || "Failed to load runtime runs.");
      return;
    }

    setRuntimeRuns(result.runs.map(mapRuntimeRunRecord));
    setRuntimeRunsError(null);
  }

  function rememberAttachments(attachments: ComposerAttachment[]) {
    if (attachments.length === 0) {
      return [];
    }

    setAttachmentLibrary((current) => ({
      ...current,
      ...Object.fromEntries(
        attachments.map((attachment) => [attachment.id, attachment]),
      ),
    }));

    return attachments.map((attachment) => attachment.id);
  }

  async function ingestComposerFiles(
    fileList: FileList | File[],
    target: "chat" | "channel",
  ) {
    const files = Array.from(fileList);
    if (files.length === 0) {
      return;
    }

    try {
      const nextAttachments = await Promise.all(
        files.map((file) => buildComposerAttachment(file)),
      );
      if (target === "chat") {
        setChatDraftAttachments((current) => [...current, ...nextAttachments]);
        setChatAttachmentError(null);
      } else {
        setChannelDraftAttachments((current) => [
          ...current,
          ...nextAttachments,
        ]);
        setChannelAttachmentError(null);
      }
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to process one of the attachments.";
      if (target === "chat") {
        setChatAttachmentError(message);
      } else {
        setChannelAttachmentError(message);
      }
    }
  }

  function removeDraftAttachment(
    target: "chat" | "channel",
    attachmentId: string,
  ) {
    if (target === "chat") {
      setChatDraftAttachments((current) =>
        current.filter((attachment) => attachment.id !== attachmentId),
      );
    } else {
      setChannelDraftAttachments((current) =>
        current.filter((attachment) => attachment.id !== attachmentId),
      );
    }
  }

  useEffect(() => {
    if (!selectedAgentId && allAgents.length > 0) {
      setSelectedAgentId(allAgents[0].id);
      return;
    }

    if (
      selectedAgentId &&
      allAgents.every((agent) => agent.id !== selectedAgentId)
    ) {
      setSelectedAgentId(allAgents[0]?.id ?? "");
    }
  }, [allAgents, selectedAgentId]);

  useEffect(() => {
    if (!selectedChannelId && channels.length > 0) {
      setSelectedChannelId(channels[0].id);
      return;
    }

    if (
      selectedChannelId &&
      channels.every((channel) => channel.id !== selectedChannelId)
    ) {
      setSelectedChannelId(channels[0]?.id ?? "");
    }
  }, [channels, selectedChannelId]);

  useEffect(() => {
    if (!selectedCouncilSessionId && councilSessions.length > 0) {
      setSelectedCouncilSessionId(councilSessions[0].id);
      return;
    }

    if (
      selectedCouncilSessionId &&
      councilSessions.every(
        (session) => session.id !== selectedCouncilSessionId,
      )
    ) {
      setSelectedCouncilSessionId(councilSessions[0]?.id ?? "");
    }
  }, [councilSessions, selectedCouncilSessionId]);

  useEffect(() => {
    if (!hasAgentRuntime) {
      return;
    }

    void refreshRuntimeRuns(
      workspaceView === "activity" ? undefined : selectedAgent?.id,
    );
  }, [selectedAgent?.id, workspaceView]);

  useEffect(() => {
    if (!hasAgentRuntime) {
      return;
    }

    const shouldPoll =
      workspaceView === "activity" ||
      runtimeRuns.some((run) => run.status === "running");

    if (!shouldPoll) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void refreshRuntimeRuns(
        workspaceView === "activity" ? undefined : selectedAgent?.id,
      );
    }, 4000);

    return () => window.clearInterval(intervalId);
  }, [runtimeRuns, selectedAgent?.id, workspaceView]);

  useEffect(() => {
    if (runtimeRuns.length === 0) {
      setSelectedActivityRunId(null);
      return;
    }

    if (
      !selectedActivityRunId ||
      runtimeRuns.every((run) => run.id !== selectedActivityRunId)
    ) {
      setSelectedActivityRunId(runtimeRuns[0].id);
    }
  }, [runtimeRuns, selectedActivityRunId]);

  useEffect(() => {
    setMessagesByAgent((current) => {
      const nextState = { ...current };
      let changed = false;

      allAgents.forEach((agent) => {
        if (!nextState[agent.id]) {
          nextState[agent.id] = [];
          changed = true;
        }
      });

      return changed ? nextState : current;
    });
  }, [allAgents]);

  useEffect(() => {
    setChannelMessagesById((current) => {
      const nextState = { ...current };
      let changed = false;

      channels.forEach((channel) => {
        if (!nextState[channel.id]) {
          nextState[channel.id] =
            createDefaultChannelMessages([channel], allAgents)[channel.id] ??
            [];
          changed = true;
        }
      });

      return changed ? nextState : current;
    });
  }, [allAgents, channels]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEYS.customAgents,
      JSON.stringify(customAgents),
    );
  }, [customAgents]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEYS.delegations,
      JSON.stringify(delegations),
    );
  }, [delegations]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEYS.messages,
      JSON.stringify(messagesByAgent),
    );
  }, [messagesByAgent]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEYS.channels,
      JSON.stringify(channels),
    );
  }, [channels]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEYS.channelMessages,
      JSON.stringify(channelMessagesById),
    );
  }, [channelMessagesById]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEYS.commandRuns,
      JSON.stringify(commandRuns),
    );
  }, [commandRuns]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEYS.selectedAgentId,
      JSON.stringify(selectedAgentId),
    );
  }, [selectedAgentId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEYS.selectedChannelId,
      JSON.stringify(selectedChannelId),
    );
  }, [selectedChannelId]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEYS.workspaceView,
      JSON.stringify(workspaceView),
    );
  }, [workspaceView]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(
      "control-room.sidebar-width",
      JSON.stringify(sidebarWidth),
    );
  }, [sidebarWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingSidebarRef.current) {
        return;
      }

      setSidebarWidth(Math.min(420, Math.max(248, event.clientX)));
    };

    const handleMouseUp = () => {
      isResizingSidebarRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!delegationDraft.assigneeId && customAgents[0]) {
      setDelegationDraft((current) => ({
        ...current,
        assigneeId: customAgents[0].id,
      }));
    }
  }, [customAgents, delegationDraft.assigneeId]);

  useEffect(() => {
    if (!channelDraft.leadAgentId && allAgents[0]) {
      setChannelDraft((current) => ({
        ...current,
        leadAgentId: allAgents[0].id,
        memberAgentIds:
          current.memberAgentIds.length > 0
            ? current.memberAgentIds
            : [allAgents[0].id],
        memberTargets: {
          ...current.memberTargets,
          [allAgents[0].id]: current.memberTargets[allAgents[0].id] || "",
        },
      }));
    }
  }, [allAgents, channelDraft.leadAgentId]);

  useEffect(() => {
    if (!delegationDraft.assigneeId) {
      return;
    }

    const assignee = allAgents.find(
      (agent) => agent.id === delegationDraft.assigneeId,
    );
    if (!assignee) {
      return;
    }

    setDelegationDraft((current) => {
      const nextCwd =
        current.cwd.trim().length > 0 &&
        current.assigneeId === delegationDraft.assigneeId
          ? current.cwd
          : assignee.workspace || "";

      if (nextCwd === current.cwd) {
        return current;
      }

      return {
        ...current,
        cwd: nextCwd,
      };
    });
  }, [allAgents, delegationDraft.assigneeId]);

  useEffect(() => {
    if (!selectedAgent) {
      return;
    }

    setCommandCwdDraft(selectedAgent.workspace || "");
    setCommandError(null);
  }, [selectedAgent]);

  useEffect(() => {
    if (!hasAgentRuntime) {
      return;
    }

    let active = true;

    void getAgentRuntimeHealth().then((result) => {
      if (active) {
        setRuntimeHealth(result);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasAgentRuntime || !runtimeHealth.ok) {
      return;
    }

    const subscription = subscribeToRuntimeEvents({
      onEvent: (event) => {
        if (
          event.type === "run:completed" ||
          event.type === "run:failed" ||
          event.type === "run:canceled"
        ) {
          void refreshRuntimeRuns();
        }

        if (event.type === "run:started" || event.type === "run:queued") {
          void refreshRuntimeRuns();
        }

        if (event.data?.activityKind || event.data?.activity) {
          const activityData = event.data?.activity as
            | Record<string, unknown>
            | undefined;
          pushLiveActivity({
            id: event.id,
            agentId: event.agentId,
            kind: toLiveActivityKind(
              (event.data?.activityKind as string) ||
                (activityData?.kind as string) ||
                "sandbox",
            ),
            label:
              (event.data?.activityLabel as string) ||
              (activityData?.label as string) ||
              event.type.replace("run:", ""),
            detail:
              (event.data?.command as string) ||
              (activityData?.summary as string) ||
              "",
            status: event.type.includes("completed")
              ? "completed"
              : event.type.includes("failed")
                ? "failed"
                : "running",
            timestamp: event.timestamp,
          });
        }
      },
      onError: (error) => {
        log(`SSE connection error: ${error.message}`);
      },
      reconnectIntervalMs: 5000,
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [runtimeHealth.ok]);

  function log(message: string) {
    if (typeof window !== "undefined") {
      console.log(`[control-room] ${message}`);
    }
  }

  useEffect(() => {
    if (!copilotAuthSession || !isCopilotAuthDialogOpen) {
      return;
    }

    let canceled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      if (canceled) {
        return;
      }

      if (Date.now() >= copilotAuthSession.expiresAt) {
        setIsPollingCopilotAuth(false);
        setCopilotAuthError(
          "GitHub device code expired. Start a new Copilot login attempt.",
        );
        return;
      }

      setIsPollingCopilotAuth(true);
      const result = await pollGithubCopilotDeviceAuth(
        copilotAuthSession.deviceCode,
      );

      if (canceled) {
        return;
      }

      if (result.ok && result.authenticated) {
        setIsPollingCopilotAuth(false);
        setCopilotAuthSession(null);
        setIsCopilotAuthDialogOpen(false);
        setCopilotAuthError(null);
        await refreshRuntimeHealth();
        return;
      }

      if (result.pending) {
        const nextInterval = Math.max(
          2,
          Number(result.interval || copilotAuthSession.interval || 5),
        );
        setIsPollingCopilotAuth(false);
        setCopilotAuthSession((current) =>
          current
            ? {
                ...current,
                interval: nextInterval,
              }
            : current,
        );
        timer = setTimeout(() => {
          void poll();
        }, nextInterval * 1000);
        return;
      }

      setIsPollingCopilotAuth(false);
      setCopilotAuthError(
        result.error || "Copilot login failed. Start the flow again.",
      );
    };

    timer = setTimeout(
      () => {
        void poll();
      },
      Math.max(2, copilotAuthSession.interval) * 1000,
    );

    return () => {
      canceled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [copilotAuthSession, isCopilotAuthDialogOpen]);

  useEffect(() => {
    const client = supabaseClient;

    if (!client) {
      workspacePersistenceReadyRef.current = true;
      setWorkspaceSyncMode("local");
      setWorkspaceSyncError(null);
      return;
    }

    const liveClient = client;

    let active = true;

    async function loadWorkspaceState() {
      setWorkspaceSyncMode("syncing");

      const [agentsRes, delegationsRes, messagesRes, commandRunsRes] =
        await Promise.all([
          liveClient
            .from("workspace_agents")
            .select("*")
            .eq("workspace_id", PERSONAL_WORKSPACE_ID)
            .order("created_at", { ascending: true }),
          liveClient
            .from("workspace_delegations")
            .select("*")
            .eq("workspace_id", PERSONAL_WORKSPACE_ID)
            .order("updated_at", { ascending: false }),
          liveClient
            .from("workspace_messages")
            .select("*")
            .eq("workspace_id", PERSONAL_WORKSPACE_ID)
            .order("message_timestamp", { ascending: true }),
          liveClient
            .from("workspace_command_runs")
            .select("*")
            .eq("workspace_id", PERSONAL_WORKSPACE_ID)
            .order("created_at", { ascending: false }),
        ]);

      if (!active) {
        return;
      }

      if (agentsRes.error) throw agentsRes.error;
      if (delegationsRes.error) throw delegationsRes.error;
      if (messagesRes.error) throw messagesRes.error;
      if (commandRunsRes.error) throw commandRunsRes.error;

      const nextAgents = (agentsRes.data ?? []) as WorkspaceAgentRow[];
      const nextDelegations = (delegationsRes.data ??
        []) as WorkspaceDelegationRow[];
      const nextMessages = (messagesRes.data ?? []) as WorkspaceMessageRow[];
      const nextCommandRuns = (commandRunsRes.data ??
        []) as WorkspaceCommandRunRow[];

      if (nextAgents.length > 0) {
        const mappedAgents = mergeDefaultCustomAgents(
          nextAgents.map(mapWorkspaceAgentRow),
        );
        workspaceSyncSignatureRef.current.customAgents =
          customAgentsSignature(mappedAgents);
        setCustomAgents(mappedAgents);
      }

      if (nextDelegations.length > 0) {
        const mappedDelegations = nextDelegations.map(
          mapWorkspaceDelegationRow,
        );
        workspaceSyncSignatureRef.current.delegations =
          delegationSignature(mappedDelegations);
        setDelegations(mappedDelegations);
      }

      if (nextMessages.length > 0) {
        const groupedMessages = groupWorkspaceMessages(nextMessages);
        workspaceSyncSignatureRef.current.messages =
          messageMapSignature(groupedMessages);
        setMessagesByAgent(groupedMessages);
      }

      if (nextCommandRuns.length > 0) {
        const mappedRuns = nextCommandRuns.map(mapWorkspaceCommandRunRow);
        workspaceSyncSignatureRef.current.commandRuns =
          commandRunsSignature(mappedRuns);
        setCommandRuns(mappedRuns);
      }

      workspacePersistenceReadyRef.current = true;
      setWorkspaceSyncError(null);
      setWorkspaceSyncMode("live");
    }

    void loadWorkspaceState().catch((error) => {
      if (!active) {
        return;
      }

      workspacePersistenceReadyRef.current = true;
      setWorkspaceSyncMode("fallback");
      setWorkspaceSyncError(
        error instanceof Error
          ? error.message
          : "Failed to load workspace state.",
      );
    });

    const channel = client
      .channel("control-room-workspace-state")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_agents" },
        () => void loadWorkspaceState().catch(() => {}),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_delegations" },
        () => void loadWorkspaceState().catch(() => {}),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_messages" },
        () => void loadWorkspaceState().catch(() => {}),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_command_runs" },
        () => void loadWorkspaceState().catch(() => {}),
      )
      .subscribe();

    return () => {
      active = false;
      void liveClient.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const client = supabaseClient;
    const nextSignature = customAgentsSignature(customAgents);

    if (
      !client ||
      !workspacePersistenceReadyRef.current ||
      workspaceSyncMode !== "live"
    ) {
      return;
    }

    if (workspaceSyncSignatureRef.current.customAgents === nextSignature) {
      return;
    }

    const rows = customAgents.map((agent) => ({
      id: agent.id,
      workspace_id: PERSONAL_WORKSPACE_ID,
      name: agent.name,
      emoji: agent.emoji,
      subtitle: agent.subtitle,
      type: agent.type,
      role: agent.role,
      accent: agent.accent,
      status: agent.status,
      current_activity: agent.currentActivity,
      last_seen: agent.lastSeen,
      tasks_completed: agent.tasksCompleted,
      accuracy: agent.accuracy,
      skills: agent.skills,
      source: agent.source,
      provider: agent.provider,
      model: agent.model,
      objective: agent.objective,
      system_prompt: agent.systemPrompt,
      specialties: agent.specialties,
      tools: agent.tools,
      workspace_path: agent.workspace,
      sandbox_mode: agent.sandboxMode,
      permissions: agent.permissions as unknown as Json,
    }));

    void client
      .from("workspace_agents")
      .upsert(rows, { onConflict: "id" })
      .then(({ error }) => {
        if (error) {
          setWorkspaceSyncMode("fallback");
          setWorkspaceSyncError(error.message);
          return;
        }

        workspaceSyncSignatureRef.current.customAgents = nextSignature;
      });
  }, [customAgents, workspaceSyncMode]);

  useEffect(() => {
    const client = supabaseClient;
    const nextSignature = delegationSignature(delegations);

    if (
      !client ||
      !workspacePersistenceReadyRef.current ||
      workspaceSyncMode !== "live"
    ) {
      return;
    }

    if (workspaceSyncSignatureRef.current.delegations === nextSignature) {
      return;
    }

    const rows = delegations.map((task) => ({
      id: task.id,
      workspace_id: PERSONAL_WORKSPACE_ID,
      title: task.title,
      from_agent_id: task.fromAgentId,
      assignee_id: task.assigneeId,
      status: task.status,
      priority: task.priority,
      notes: task.notes,
      execution_mode: task.executionMode,
      payload: task.payload,
      cwd: task.cwd,
      updated_at: task.updatedAt,
    }));

    void client
      .from("workspace_delegations")
      .upsert(rows, { onConflict: "id" })
      .then(({ error }) => {
        if (error) {
          setWorkspaceSyncMode("fallback");
          setWorkspaceSyncError(error.message);
          return;
        }

        workspaceSyncSignatureRef.current.delegations = nextSignature;
      });
  }, [delegations, workspaceSyncMode]);

  useEffect(() => {
    const client = supabaseClient;
    const nextSignature = messageMapSignature(messagesByAgent);

    if (
      !client ||
      !workspacePersistenceReadyRef.current ||
      workspaceSyncMode !== "live"
    ) {
      return;
    }

    if (workspaceSyncSignatureRef.current.messages === nextSignature) {
      return;
    }

    const rows = Object.values(messagesByAgent)
      .flat()
      .map((message) => ({
        id: message.id,
        workspace_id: PERSONAL_WORKSPACE_ID,
        agent_id: message.agentId,
        role: message.role,
        sender: message.sender,
        content: message.content,
        message_timestamp: message.timestamp,
      }));

    void client
      .from("workspace_messages")
      .upsert(rows, { onConflict: "id" })
      .then(({ error }) => {
        if (error) {
          setWorkspaceSyncMode("fallback");
          setWorkspaceSyncError(error.message);
          return;
        }

        workspaceSyncSignatureRef.current.messages = nextSignature;
      });
  }, [messagesByAgent, workspaceSyncMode]);

  useEffect(() => {
    const client = supabaseClient;
    const nextSignature = commandRunsSignature(commandRuns);

    if (
      !client ||
      !workspacePersistenceReadyRef.current ||
      workspaceSyncMode !== "live"
    ) {
      return;
    }

    if (workspaceSyncSignatureRef.current.commandRuns === nextSignature) {
      return;
    }

    const rows = commandRuns.map((run) => ({
      id: run.id,
      workspace_id: PERSONAL_WORKSPACE_ID,
      agent_id: run.agentId,
      command: run.command,
      cwd: run.cwd,
      status: run.status,
      phase: run.phase || run.status,
      exit_code: run.exitCode,
      stdout: run.stdout,
      stderr: run.stderr,
      timed_out: run.timedOut,
      duration_ms: run.durationMs,
      created_at: run.createdAt,
      retry_count: run.retryCount ?? 0,
      max_retries: run.maxRetries ?? 3,
      parent_run_id: run.parentRunId ?? null,
      retry_of_run_id: run.retryOfRunId ?? null,
      model: run.model ?? null,
      provider: run.provider ?? null,
    }));

    void client
      .from("workspace_command_runs")
      .upsert(rows, { onConflict: "id" })
      .then(({ error }) => {
        if (error) {
          setWorkspaceSyncMode("fallback");
          setWorkspaceSyncError(error.message);
          return;
        }

        workspaceSyncSignatureRef.current.commandRuns = nextSignature;
      });
  }, [commandRuns, workspaceSyncMode]);

  useEffect(() => {
    const client = supabaseClient;

    if (!client) {
      orchestrationPersistenceReadyRef.current = true;
      setOrchestrationSyncMode("local");
      setOrchestrationSyncError(null);
      return;
    }

    const liveClient = client;
    let active = true;

    async function loadOrchestrationState() {
      setOrchestrationSyncMode("syncing");

      const [
        dispatcherRes,
        contextPackagesRes,
        taskTreesRes,
        verifierReviewsRes,
        planReviewsRes,
        circuitBreakerEventsRes,
        knowledgeGraphsRes,
        toolDraftsRes,
      ] = await Promise.all([
        liveClient
          .from("workspace_dispatcher_decisions")
          .select("*")
          .eq("workspace_id", PERSONAL_WORKSPACE_ID)
          .order("created_at", { ascending: false }),
        liveClient
          .from("workspace_context_packages")
          .select("*")
          .eq("workspace_id", PERSONAL_WORKSPACE_ID)
          .order("updated_at", { ascending: false }),
        liveClient
          .from("workspace_task_trees")
          .select("*")
          .eq("workspace_id", PERSONAL_WORKSPACE_ID)
          .order("updated_at", { ascending: false }),
        liveClient
          .from("workspace_verifier_reviews")
          .select("*")
          .eq("workspace_id", PERSONAL_WORKSPACE_ID)
          .order("created_at", { ascending: false }),
        liveClient
          .from("workspace_plan_reviews")
          .select("*")
          .eq("workspace_id", PERSONAL_WORKSPACE_ID)
          .order("updated_at", { ascending: false }),
        liveClient
          .from("workspace_circuit_breaker_events")
          .select("*")
          .eq("workspace_id", PERSONAL_WORKSPACE_ID)
          .order("triggered_at", { ascending: false }),
        liveClient
          .from("workspace_knowledge_graphs")
          .select("*")
          .eq("workspace_id", PERSONAL_WORKSPACE_ID)
          .order("updated_at", { ascending: false }),
        liveClient
          .from("workspace_tool_drafts")
          .select("*")
          .eq("workspace_id", PERSONAL_WORKSPACE_ID)
          .order("updated_at", { ascending: false }),
      ]);

      if (!active) {
        return;
      }

      if (dispatcherRes.error) throw dispatcherRes.error;
      if (contextPackagesRes.error) throw contextPackagesRes.error;
      if (taskTreesRes.error) throw taskTreesRes.error;
      if (verifierReviewsRes.error) throw verifierReviewsRes.error;
      if (planReviewsRes.error) throw planReviewsRes.error;
      if (circuitBreakerEventsRes.error) throw circuitBreakerEventsRes.error;
      if (knowledgeGraphsRes.error) throw knowledgeGraphsRes.error;
      if (toolDraftsRes.error) throw toolDraftsRes.error;

      const mappedDispatcherDecisions = (
        (dispatcherRes.data ?? []) as WorkspaceDispatcherDecisionRow[]
      ).map(mapWorkspaceDispatcherDecisionRow);
      const mappedContextPackages = Object.fromEntries(
        ((contextPackagesRes.data ?? []) as WorkspaceContextPackageRow[]).map(
          (row) => {
            const nextPackage = mapWorkspaceContextPackageRow(row);
            return [nextPackage.agentId, nextPackage];
          },
        ),
      ) as Record<string, ContextPackage>;
      const mappedTaskTrees = (
        (taskTreesRes.data ?? []) as WorkspaceTaskTreeRow[]
      ).map(mapWorkspaceTaskTreeRow);
      const mappedVerifierReviews = (
        (verifierReviewsRes.data ?? []) as WorkspaceVerifierReviewRow[]
      ).map(mapWorkspaceVerifierReviewRow);
      const mappedPlanReviews = (
        (planReviewsRes.data ?? []) as WorkspacePlanReviewRow[]
      ).map(mapWorkspacePlanReviewRow);
      const mappedCircuitBreakerEvents = (
        (circuitBreakerEventsRes.data ?? []) as WorkspaceCircuitBreakerEventRow[]
      ).map(mapWorkspaceCircuitBreakerEventRow);
      const mappedKnowledgeGraphs = Object.fromEntries(
        ((knowledgeGraphsRes.data ?? []) as WorkspaceKnowledgeGraphRow[]).map(
          (row) => [row.agent_id, mapWorkspaceKnowledgeGraphRow(row)],
        ),
      ) as Record<string, KnowledgeGraph>;
      const mappedToolDrafts = (
        (toolDraftsRes.data ?? []) as WorkspaceToolDraftRow[]
      ).map(mapWorkspaceToolDraftRow);

      hydrateOrchestrationFromRemote({
        dispatcherDecisions: mappedDispatcherDecisions,
        contextPackagesByAgent: mappedContextPackages,
        taskTrees: mappedTaskTrees,
        verifierReviews: mappedVerifierReviews,
        planReviews: mappedPlanReviews,
        circuitBreakerEvents: mappedCircuitBreakerEvents,
        knowledgeGraphByAgent: mappedKnowledgeGraphs,
        toolDrafts: mappedToolDrafts,
      });

      orchestrationSyncSignatureRef.current.dispatcherDecisions =
        dispatcherDecisionsSignature(mappedDispatcherDecisions);
      orchestrationSyncSignatureRef.current.contextPackages =
        contextPackagesSignature(mappedContextPackages);
      orchestrationSyncSignatureRef.current.taskTrees =
        taskTreesSignature(mappedTaskTrees);
      orchestrationSyncSignatureRef.current.verifierReviews =
        verifierReviewsSignature(mappedVerifierReviews);
      orchestrationSyncSignatureRef.current.planReviews =
        planReviewsSignature(mappedPlanReviews);
      orchestrationSyncSignatureRef.current.circuitBreakerEvents =
        circuitBreakerEventsSignature(mappedCircuitBreakerEvents);
      orchestrationSyncSignatureRef.current.knowledgeGraphs =
        knowledgeGraphsSignature(mappedKnowledgeGraphs);
      orchestrationSyncSignatureRef.current.toolDrafts =
        toolDraftsSignature(mappedToolDrafts);

      orchestrationPersistenceReadyRef.current = true;
      setOrchestrationSyncError(null);
      setOrchestrationSyncMode("live");
    }

    void loadOrchestrationState().catch((error) => {
      if (!active) {
        return;
      }

      orchestrationPersistenceReadyRef.current = true;
      setOrchestrationSyncMode("fallback");
      setOrchestrationSyncError(
        error instanceof Error
          ? error.message
          : "Failed to load orchestration state.",
      );
    });

    const channel = client
      .channel("control-room-orchestration-state")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_dispatcher_decisions",
        },
        () => void loadOrchestrationState().catch(() => {}),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_context_packages" },
        () => void loadOrchestrationState().catch(() => {}),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_task_trees" },
        () => void loadOrchestrationState().catch(() => {}),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_verifier_reviews" },
        () => void loadOrchestrationState().catch(() => {}),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_plan_reviews" },
        () => void loadOrchestrationState().catch(() => {}),
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "workspace_circuit_breaker_events",
        },
        () => void loadOrchestrationState().catch(() => {}),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_knowledge_graphs" },
        () => void loadOrchestrationState().catch(() => {}),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workspace_tool_drafts" },
        () => void loadOrchestrationState().catch(() => {}),
      )
      .subscribe();

    return () => {
      active = false;
      void liveClient.removeChannel(channel);
    };
  }, [hydrateOrchestrationFromRemote]);

  useEffect(() => {
    const client = supabaseClient;
    const nextDispatcherSignature =
      dispatcherDecisionsSignature(dispatcherDecisions);
    const nextContextPackagesSignature =
      contextPackagesSignature(contextPackagesByAgent);
    const nextTaskTreesSignature = taskTreesSignature(taskTrees);
    const nextVerifierReviewsSignature =
      verifierReviewsSignature(verifierReviews);
    const nextPlanReviewsSignature = planReviewsSignature(planReviews);
    const nextCircuitBreakerSignature =
      circuitBreakerEventsSignature(circuitBreakerEvents);
    const nextKnowledgeGraphsSignature =
      knowledgeGraphsSignature(knowledgeGraphByAgent);
    const nextToolDraftsSignature = toolDraftsSignature(toolDrafts);

    if (
      !client ||
      !orchestrationPersistenceReadyRef.current ||
      orchestrationSyncMode !== "live"
    ) {
      return;
    }

    const operations: Array<
      PromiseLike<{ error: { message: string } | null }>
    > = [];

    if (
      orchestrationSyncSignatureRef.current.dispatcherDecisions !==
      nextDispatcherSignature
    ) {
      operations.push(
        client
          .from("workspace_dispatcher_decisions")
          .upsert(
            dispatcherDecisions.map((decision) => ({
              id: decision.id,
              workspace_id: PERSONAL_WORKSPACE_ID,
              lead_agent_id: decision.leadAgentId,
              lane: decision.lane,
              intent: decision.intent,
              risk_level: decision.riskLevel,
              complexity_score: decision.complexityScore,
              requires_plan_review: decision.requiresPlanReview,
              created_at: decision.createdAt,
              payload: decision as unknown as Json,
            })),
            { onConflict: "id" },
          )
          .then(({ error }) => {
            if (!error) {
              orchestrationSyncSignatureRef.current.dispatcherDecisions =
                nextDispatcherSignature;
            }
            return { error };
          }),
      );
    }

    if (
      orchestrationSyncSignatureRef.current.contextPackages !==
      nextContextPackagesSignature
    ) {
      operations.push(
        client
          .from("workspace_context_packages")
          .upsert(
            Object.values(contextPackagesByAgent).map((contextPackage) => ({
              id: contextPackage.id,
              workspace_id: PERSONAL_WORKSPACE_ID,
              agent_id: contextPackage.agentId,
              created_at: contextPackage.createdAt,
              updated_at: contextPackage.createdAt,
              payload: contextPackage as unknown as Json,
            })),
            { onConflict: "id" },
          )
          .then(({ error }) => {
            if (!error) {
              orchestrationSyncSignatureRef.current.contextPackages =
                nextContextPackagesSignature;
            }
            return { error };
          }),
      );
    }

    if (
      orchestrationSyncSignatureRef.current.taskTrees !==
      nextTaskTreesSignature
    ) {
      operations.push(
        client
          .from("workspace_task_trees")
          .upsert(
            taskTrees.map((taskTree) => ({
              id: taskTree.id,
              workspace_id: PERSONAL_WORKSPACE_ID,
              dispatcher_decision_id: taskTree.dispatcherDecisionId,
              root_agent_id: taskTree.rootAgentId,
              status: taskTree.status,
              created_at: taskTree.createdAt,
              updated_at: taskTree.updatedAt,
              payload: taskTree as unknown as Json,
            })),
            { onConflict: "id" },
          )
          .then(({ error }) => {
            if (!error) {
              orchestrationSyncSignatureRef.current.taskTrees =
                nextTaskTreesSignature;
            }
            return { error };
          }),
      );
    }

    if (
      orchestrationSyncSignatureRef.current.verifierReviews !==
      nextVerifierReviewsSignature
    ) {
      operations.push(
        client
          .from("workspace_verifier_reviews")
          .upsert(
            verifierReviews.map((review) => ({
              id: review.id,
              workspace_id: PERSONAL_WORKSPACE_ID,
              agent_id: review.agentId,
              task_tree_id: review.taskTreeId ?? null,
              verdict: review.verdict,
              attempts: review.attempts,
              created_at: review.createdAt,
              payload: review as unknown as Json,
            })),
            { onConflict: "id" },
          )
          .then(({ error }) => {
            if (!error) {
              orchestrationSyncSignatureRef.current.verifierReviews =
                nextVerifierReviewsSignature;
            }
            return { error };
          }),
      );
    }

    if (
      orchestrationSyncSignatureRef.current.planReviews !==
      nextPlanReviewsSignature
    ) {
      operations.push(
        client
          .from("workspace_plan_reviews")
          .upsert(
            planReviews.map((review) => ({
              id: review.id,
              workspace_id: PERSONAL_WORKSPACE_ID,
              dispatcher_decision_id: review.dispatcherDecisionId,
              status: review.status,
              risk_level: review.riskLevel,
              created_at: review.createdAt,
              updated_at: review.decidedAt ?? review.createdAt,
              payload: review as unknown as Json,
            })),
            { onConflict: "id" },
          )
          .then(({ error }) => {
            if (!error) {
              orchestrationSyncSignatureRef.current.planReviews =
                nextPlanReviewsSignature;
            }
            return { error };
          }),
      );
    }

    if (
      orchestrationSyncSignatureRef.current.circuitBreakerEvents !==
      nextCircuitBreakerSignature
    ) {
      operations.push(
        client
          .from("workspace_circuit_breaker_events")
          .upsert(
            circuitBreakerEvents.map((event) => ({
              id: event.id,
              workspace_id: PERSONAL_WORKSPACE_ID,
              agent_id: event.agentId,
              resolution: event.resolution,
              triggered_at: event.triggeredAt,
              payload: event as unknown as Json,
            })),
            { onConflict: "id" },
          )
          .then(({ error }) => {
            if (!error) {
              orchestrationSyncSignatureRef.current.circuitBreakerEvents =
                nextCircuitBreakerSignature;
            }
            return { error };
          }),
      );
    }

    if (
      orchestrationSyncSignatureRef.current.knowledgeGraphs !==
      nextKnowledgeGraphsSignature
    ) {
      operations.push(
        client
          .from("workspace_knowledge_graphs")
          .upsert(
            Object.entries(knowledgeGraphByAgent).map(([agentId, graph]) => ({
              id: `graph-${agentId}`,
              workspace_id: PERSONAL_WORKSPACE_ID,
              agent_id: agentId,
              generated_at: graph.generatedAt,
              updated_at: graph.generatedAt,
              payload: graph as unknown as Json,
            })),
            { onConflict: "id" },
          )
          .then(({ error }) => {
            if (!error) {
              orchestrationSyncSignatureRef.current.knowledgeGraphs =
                nextKnowledgeGraphsSignature;
            }
            return { error };
          }),
      );
    }

    if (
      orchestrationSyncSignatureRef.current.toolDrafts !==
      nextToolDraftsSignature
    ) {
      operations.push(
        client
          .from("workspace_tool_drafts")
          .upsert(
            toolDrafts.map((draft) => ({
              id: draft.id,
              workspace_id: PERSONAL_WORKSPACE_ID,
              status: draft.status,
              language: draft.language,
              created_at: draft.createdAt,
              updated_at:
                draft.promotedAt ?? draft.validatedAt ?? draft.createdAt,
              payload: draft as unknown as Json,
            })),
            { onConflict: "id" },
          )
          .then(({ error }) => {
            if (!error) {
              orchestrationSyncSignatureRef.current.toolDrafts =
                nextToolDraftsSignature;
            }
            return { error };
          }),
      );
    }

    if (operations.length === 0) {
      return;
    }

    void Promise.all(operations).then((results) => {
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) {
        setOrchestrationSyncMode("fallback");
        setOrchestrationSyncError(firstError.message);
      }
    });
  }, [
    circuitBreakerEvents,
    contextPackagesByAgent,
    dispatcherDecisions,
    knowledgeGraphByAgent,
    orchestrationSyncMode,
    planReviews,
    taskTrees,
    toolDrafts,
    verifierReviews,
  ]);

  function updateCustomAgent(
    agentId: string,
    updater: (agent: WorkspaceAgent) => WorkspaceAgent,
  ) {
    setCustomAgents((currentAgents) =>
      currentAgents.map((agent) =>
        agent.id === agentId ? updater(agent) : agent,
      ),
    );
  }

  function updatePermission(
    agentId: string,
    key: PermissionKey,
    pressed: boolean,
  ) {
    updateCustomAgent(agentId, (agent) => {
      const permissions = { ...agent.permissions, [key]: pressed };
      return {
        ...agent,
        permissions,
        tools: deriveTools(permissions),
        lastSeen: new Date().toISOString(),
      };
    });
  }

  function updateDelegationTask(
    taskId: string,
    updater: (task: DelegationTask) => DelegationTask,
  ) {
    setDelegations((currentTasks) =>
      currentTasks.map((task) => (task.id === taskId ? updater(task) : task)),
    );
  }

  function appendAgentMessage(agentId: string, message: ChatMessage) {
    setMessagesByAgent((current) => ({
      ...current,
      [agentId]: [...(current[agentId] ?? []), message],
    }));
  }

  function appendChannelMessage(channelId: string, message: ChannelMessage) {
    setChannelMessagesById((current) => ({
      ...current,
      [channelId]: [...(current[channelId] ?? []), message],
    }));
  }

  function updateChannel(
    channelId: string,
    updater: (channel: CollaborationChannel) => CollaborationChannel,
  ) {
    setChannels((current) =>
      current.map((channel) =>
        channel.id === channelId ? updater(channel) : channel,
      ),
    );
  }

  function appendThreadRouteTurn(input: {
    agentId: string;
    userMessageId: string;
    request: string;
    decision: RouterDecision;
  }) {
    const nextTurn = {
      id: `route-turn-${Date.now().toString(36)}`,
      agentId: input.agentId,
      userMessageId: input.userMessageId,
      request: input.request,
      decision: input.decision,
      openedChannelId: null,
      createdAt: new Date().toISOString(),
    };

    setThreadTurnsByAgent((current) => ({
      ...current,
      [input.agentId]: [...(current[input.agentId] ?? []), nextTurn],
    }));
  }

  function updateThreadRouteTurnChannelId(
    agentId: string,
    userMessageId: string,
    channelId: string,
  ) {
    setThreadTurnsByAgent((current) => ({
      ...current,
      [agentId]: (current[agentId] ?? []).map((turn) =>
        turn.userMessageId === userMessageId
          ? { ...turn, openedChannelId: channelId }
          : turn,
      ),
    }));
  }

  function updateThoughtSnapshot(input: {
    agentId: string;
    thought: string;
    command?: string;
    observation?: string;
  }) {
    setLatestThoughtByAgentId((current) => ({
      ...current,
      [input.agentId]: {
        thought: input.thought,
        command: input.command,
        observation: input.observation,
        updatedAt: new Date().toISOString(),
      },
    }));
  }

  async function loadPhaseTwoMemoryContext(agentId: string) {
    const bundle = await loadMemoryContext(agentId);
    const agent = allAgents.find((candidate) => candidate.id === agentId) ?? null;
    setLatestMemoryByAgentId((current) => ({
      ...current,
      [agentId]: {
        summary: bundle.thread?.summary || "",
        notes: bundle.notes.slice(0, 4).map((note) => note.title),
        knowledge: bundle.knowledge.slice(0, 4).map((entry) => entry.title),
        updatedAt: new Date().toISOString(),
      },
    }));

    if (agent) {
      setKnowledgeGraph(
        agentId,
        buildKnowledgeGraph({
          agent,
          memory: bundle,
          channel:
            selectedChannel && selectedChannel.memberAgentIds.includes(agentId)
              ? selectedChannel
              : null,
          preferences: digitalTwinProfile,
        }),
      );
    }

    const memoryContextMessage = buildMemoryContextMessage(bundle);
    return {
      bundle,
      runtimeMessages: memoryContextMessage ? [memoryContextMessage] : [],
    };
  }

  async function persistPhaseTwoMessage(
    message: Pick<ChatMessage, "agentId" | "role" | "content" | "sender">,
    totalMessages: number,
    metadata?: Record<string, unknown>,
  ) {
    await persistMemoryMessage({
      agentId: message.agentId,
      role: message.role,
      content: message.content,
      sender: message.sender,
      metadata,
    });

    const summary = await maybeRefreshThreadSummary(message.agentId, totalMessages);
    if (summary) {
      setLatestMemoryByAgentId((current) => ({
        ...current,
        [message.agentId]: {
          summary,
          notes: current[message.agentId]?.notes ?? [],
          knowledge: current[message.agentId]?.knowledge ?? [],
          updatedAt: new Date().toISOString(),
        },
      }));
    }
  }

  async function runCritiquedText(input: {
    agent: WorkspaceAgent;
    prompt: string;
    text: string;
    contextMessages: RuntimeChatMessage[];
    taskTreeId?: string | null;
  }) {
    const result = await runCriticLoop({
      agent: input.agent,
      prompt: input.prompt,
      initialCandidate: input.text,
      contextMessages: input.contextMessages,
      maxAttempts: 3,
    });

    setLatestCriticByAgentId((current) => ({
      ...current,
      [input.agent.id]: result.critic,
    }));

    addVerifierReview(
      buildVerifierReview({
        agentId: input.agent.id,
        taskTreeId: input.taskTreeId ?? null,
        verdict: result.critic.verdict,
        feedback: result.critic.feedback,
        attempts: result.critic.attempts,
        candidatePreview: input.text.slice(0, 280),
      }),
    );

    if (result.critic.verdict === "rejected") {
      addLearningEvent(
        input.agent.id,
        input.agent.name,
        "critic_rejection",
        result.critic.feedback,
        { prompt: input.prompt.slice(0, 200) },
      );
    }

    return result;
  }

  function toggleChannelDraftMember(agentId: string) {
    setChannelDraft((current) => {
      const nextMembers = current.memberAgentIds.includes(agentId)
        ? current.memberAgentIds.filter((value) => value !== agentId)
        : [...current.memberAgentIds, agentId];
      const nextTargets = { ...current.memberTargets };

      if (!current.memberAgentIds.includes(agentId)) {
        nextTargets[agentId] = nextTargets[agentId] || "";
      } else if (agentId !== current.leadAgentId) {
        delete nextTargets[agentId];
      }

      return {
        ...current,
        memberAgentIds: uniqueStrings(nextMembers),
        memberTargets: nextTargets,
      };
    });
  }

  function updateChannelDraftMemberTarget(agentId: string, value: string) {
    setChannelDraft((current) => ({
      ...current,
      memberTargets: {
        ...current.memberTargets,
        [agentId]: value,
      },
    }));
  }

  function updateChannelMemberTarget(
    channelId: string,
    agentId: string,
    value: string,
  ) {
    updateChannel(channelId, (current) => ({
      ...current,
      memberTargets: {
        ...current.memberTargets,
        [agentId]: value,
      },
      updatedAt: new Date().toISOString(),
    }));
  }

  function updateAgentMessage(
    agentId: string,
    messageId: string,
    updater: (message: ChatMessage) => ChatMessage,
  ) {
    setMessagesByAgent((current) => ({
      ...current,
      [agentId]: (current[agentId] ?? []).map((message) =>
        message.id === messageId ? updater(message) : message,
      ),
    }));
  }

  function pushLiveActivity(entry: LiveActivityEntry) {
    setLiveActivityEntries((current) => [entry, ...current].slice(0, 40));
    setActivityToast({ id: entry.id, label: entry.label });
    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setActivityToast(null);
    }, 2200);
  }

  function updateLiveActivity(
    activityId: string,
    updater: (entry: LiveActivityEntry) => LiveActivityEntry,
  ) {
    setLiveActivityEntries((current) =>
      current.map((entry) =>
        entry.id === activityId ? updater(entry) : entry,
      ),
    );
  }

  function formatTerminalChunk(kind: "stdout" | "stderr", chunk: string) {
    const trimmedChunk = chunk.replace(/\r/g, "");
    if (!trimmedChunk) {
      return "";
    }

    return trimmedChunk
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => `${kind}: ${line}`)
      .join("\n");
  }

  function extractJsonObject(raw: string) {
    const trimmed = raw.trim();
    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fencedMatch?.[1]?.trim() || trimmed;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");

    if (start === -1 || end === -1 || end <= start) {
      return null;
    }

    try {
      return JSON.parse(candidate.slice(start, end + 1)) as Record<
        string,
        unknown
      >;
    } catch {
      return null;
    }
  }

  async function planAgentExecution(
    agent: WorkspaceAgent,
    prompt: string,
    contextMessages: ChatMessage[],
  ): Promise<AgentExecutionPlan | null> {
    if (
      !agent.permissions.terminal ||
      !agent.workspace ||
      !hasAgentRuntime ||
      !runtimeHealth.ok
    ) {
      return null;
    }

    if (shouldUseResumePdfSkill(prompt, contextMessages)) {
      return buildResumePdfSkillPlan(prompt, contextMessages);
    }

    const memoryContext = await loadPhaseTwoMemoryContext(agent.id);
    const plannerResult = await requestThoughtPlan({
      agent: {
        ...agent,
        systemPrompt: [
          "You are the execution planner for a multi-agent workspace.",
          "Decide whether the next user request should trigger sandbox terminal execution.",
          "Think before acting.",
          "Return a <thought>...</thought> block first, then JSON only after it.",
          'Schema: {"mode":"chat"|"command","command":"string","cwd":"string","reasoning":"string"}',
          "Pick mode=command when terminal work is the right next step: checking files, running tests, git status, searching code, listing directories, building, or debugging.",
          "Also pick mode=command when the user wants you to create, generate, save, export, or modify a local file or artifact such as a PDF, DOCX, CSV, JSON, script, markdown file, image asset, or project file.",
          "If the user follow-up refers to prior thread context with phrases like 'run it', 'do it yourself', 'create it', 'save it', or 'go ahead', infer the missing target from the recent conversation instead of asking them to restate it.",
          "Prefer safe read-first commands before mutating commands.",
          "Never claim that anything has already been executed. This is planning only.",
          `Default cwd: ${agent.workspace}`,
          `Agent role: ${agent.role}`,
          `Agent objective: ${agent.objective}`,
        ].join("\n\n"),
      },
      messages: [
        ...memoryContext.runtimeMessages,
        ...toRuntimeConversation(contextMessages.slice(-8), attachmentLibrary),
        {
          role: "user",
          content: `User request:\n${prompt}`,
        },
      ],
    });

    if (!plannerResult.ok) {
      return null;
    }

    updateThoughtSnapshot({
      agentId: agent.id,
      thought: plannerResult.parsed.thought,
    });

    const parsed = plannerResult.parsed.json;
    if (!parsed) {
      return null;
    }

    const mode = parsed.mode === "command" ? "command" : "chat";
    const command =
      typeof parsed.command === "string" ? parsed.command.trim() : "";
    const cwd =
      typeof parsed.cwd === "string" && parsed.cwd.trim()
        ? parsed.cwd.trim()
        : agent.workspace;
    const reasoning =
      typeof parsed.reasoning === "string" ? parsed.reasoning.trim() : "";

    if (mode === "command" && command) {
      return {
        mode,
        command,
        cwd,
        reasoning,
      };
    }

    return {
      mode: "chat",
      command: "",
      cwd: agent.workspace,
      reasoning,
    };
  }

  async function summarizeAgentCommandResult(input: {
    agent: WorkspaceAgent;
    previousThread: ChatMessage[];
    userPrompt: string;
    command: string;
    result: {
      ok: boolean;
      exitCode?: number;
      stdout?: string;
      stderr?: string;
      timedOut?: boolean;
      durationMs?: number;
      cwd?: string;
      error?: string;
      artifacts?: RuntimeArtifact[] | null;
    };
  }) {
    const generatedPdf =
      (input.result.artifacts ?? []).find(
        (artifact) => artifact.path && /\.pdf$/i.test(artifact.path),
      ) ?? null;

    if (input.result.ok && generatedPdf?.path) {
      const artifactName =
        generatedPdf.name ||
        generatedPdf.path.split("/").pop() ||
        "generated PDF";
      return [
        `I created the PDF and saved it to \`${generatedPdf.path}\`.`,
        `File: \`${artifactName}\``,
        "You can open it from Activity -> Files and use View to preview it inside the dashboard.",
      ].join("\n\n");
    }

    const response = await sendAgentRuntimeChat({
      agent: {
        ...input.agent,
        systemPrompt: [
          input.agent.systemPrompt,
          "You are replying after a sandbox action finished.",
          "Base your answer only on the provided command result.",
          "Do not claim you ran any commands besides the provided one.",
          "Keep the answer direct and useful.",
        ].join("\n\n"),
      },
      messages: [
        ...toRuntimeConversation(input.previousThread, attachmentLibrary),
        {
          role: "user",
          content: input.userPrompt,
        },
        {
          role: "user",
          content: [
            "Sandbox result:",
            `Command: ${input.command}`,
            input.result.cwd ? `Cwd: ${input.result.cwd}` : "",
            typeof input.result.exitCode === "number"
              ? `Exit code: ${input.result.exitCode}`
              : "",
            input.result.timedOut ? "The command timed out." : "",
            input.result.stdout ? `stdout:\n${input.result.stdout}` : "",
            input.result.stderr ? `stderr:\n${input.result.stderr}` : "",
            input.result.error ? `error: ${input.result.error}` : "",
            input.result.artifacts?.length
              ? `artifacts:\n${input.result.artifacts
                  .map(
                    (artifact) =>
                      artifact.path || artifact.url || artifact.name,
                  )
                  .filter(Boolean)
                  .join("\n")}`
              : "",
            "Now answer the user's request using this real execution result.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });

    if (response.ok && response.text) {
      return response.text;
    }

    return input.result.ok
      ? `I used the sandbox for this request and the command finished successfully.\n\nCommand: \`${input.command}\`${input.result.stdout ? `\n\n${input.result.stdout}` : ""}`
      : `I used the sandbox for this request, but the command failed.\n\nCommand: \`${input.command}\`${input.result.error ? `\n\nError: ${input.result.error}` : ""}${input.result.stderr ? `\n\n${input.result.stderr}` : ""}`;
  }

  async function summarizeAgentExecutionSequence(input: {
    agent: WorkspaceAgent;
    previousThread: ChatMessage[];
    userPrompt: string;
    steps: ExecutionStepResult[];
    browserContextMessages?: RuntimeChatMessage[];
    finalReasoning?: string;
  }) {
    const generatedArtifact =
      input.steps
        .flatMap((step) => step.result.artifacts ?? [])
        .find((artifact) => artifact.path || artifact.url || artifact.name) ??
      null;

    const generatedPdf =
      input.steps
        .flatMap((step) => step.result.artifacts ?? [])
        .find((artifact) => artifact.path && /\.pdf$/i.test(artifact.path)) ??
      null;

    if (generatedPdf?.path) {
      return [
        `I created the PDF and saved it to \`${generatedPdf.path}\`.`,
        "You can open it from Activity -> Files and use View to preview it inside the dashboard.",
      ].join("\n\n");
    }

    const transcript = input.steps
      .map((step, index) =>
        [
          `Step ${index + 1}:`,
          `Command: ${step.command}`,
          step.result.cwd
            ? `Cwd: ${step.result.cwd}`
            : step.cwd
              ? `Cwd: ${step.cwd}`
              : "",
          typeof step.result.exitCode === "number"
            ? `Exit code: ${step.result.exitCode}`
            : "",
          step.result.timedOut ? "Timed out: true" : "",
          step.result.stdout ? `stdout:\n${step.result.stdout}` : "",
          step.result.stderr ? `stderr:\n${step.result.stderr}` : "",
          step.result.error ? `error: ${step.result.error}` : "",
          step.result.artifacts?.length
            ? `artifacts:\n${step.result.artifacts
                .map(
                  (artifact) => artifact.path || artifact.url || artifact.name,
                )
                .filter(Boolean)
                .join("\n")}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n");

    const response = await sendAgentRuntimeChat({
      agent: {
        ...input.agent,
        systemPrompt: [
          input.agent.systemPrompt,
          "You are replying after one or more sandbox actions already finished.",
          "Give one final answer only.",
          "Do not narrate the process step-by-step.",
          "Do not say 'next', 'proceeding', 'I will now', or ask the user to continue unless you are truly blocked.",
          "If files were created, mention the saved path clearly.",
        ].join("\n\n"),
      },
      messages: [
        ...toRuntimeConversation(input.previousThread, attachmentLibrary),
        ...(input.browserContextMessages ?? []),
        {
          role: "user",
          content: input.userPrompt,
        },
        {
          role: "user",
          content: [
            "Completed sandbox work:",
            transcript,
            input.finalReasoning ? `Planner note: ${input.finalReasoning}` : "",
            "Now answer the user with a single final response based on the completed work.",
          ]
            .filter(Boolean)
            .join("\n\n"),
        },
      ],
    });

    if (response.ok && response.text) {
      return response.text;
    }

    if (generatedArtifact?.path) {
      return `I finished the requested work and saved the output to \`${generatedArtifact.path}\`. You can open it from Activity -> Files.`;
    }

    const lastStep = input.steps[input.steps.length - 1];
    if (!lastStep) {
      return "I finished the task in the sandbox.";
    }

    return lastStep.result.ok
      ? `I finished the sandbox work for this request after ${input.steps.length} step${input.steps.length === 1 ? "" : "s"}.\n\nLast command: \`${lastStep.command}\`${lastStep.result.stdout ? `\n\n${lastStep.result.stdout}` : ""}`
      : `I made progress in the sandbox, but the last step failed.\n\nCommand: \`${lastStep.command}\`${lastStep.result.error ? `\n\nError: ${lastStep.result.error}` : ""}${lastStep.result.stderr ? `\n\n${lastStep.result.stderr}` : ""}`;
  }

  async function streamAssistantReply(input: {
    agent: WorkspaceAgent;
    text: string;
    previousThread: ChatMessage[];
  }) {
    const messageId = `${input.agent.id}-assistant-${Date.now().toString(36)}`;
    const timestamp = new Date().toISOString();
    const activityId = `${messageId}-typing`;
    const message: ChatMessage = {
      id: messageId,
      agentId: input.agent.id,
      role: "assistant",
      sender: input.agent.name,
      content: "",
      timestamp,
    };

    pushLiveActivity({
      id: activityId,
      agentId: input.agent.id,
      kind: "typing",
      label: "Typing Reply",
      detail: "Preparing response...",
      status: "running",
      timestamp,
    });

    appendAgentMessage(input.agent.id, message);

    const segments = input.text.match(/(\S+\s*|\n+)/g) ?? [input.text];
    let rendered = "";

    for (const segment of segments) {
      rendered += segment;
      updateAgentMessage(input.agent.id, messageId, (current) => ({
        ...current,
        content: rendered,
      }));

      updateLiveActivity(activityId, (entry) => ({
        ...entry,
        detail: rendered.slice(-140).trim() || "Typing...",
      }));

      await new Promise((resolvePromise) =>
        window.setTimeout(resolvePromise, segment.includes("\n") ? 26 : 18),
      );
    }

    updateLiveActivity(activityId, (entry) => ({
      ...entry,
      status: "completed",
      detail: "Reply delivered.",
      timestamp: new Date().toISOString(),
    }));

    const totalMessages =
      (messagesByAgent[input.agent.id]?.length ?? input.previousThread.length) + 1;
    void persistPhaseTwoMessage(
      {
        agentId: input.agent.id,
        role: "assistant",
        content: rendered,
        sender: input.agent.name,
      },
      totalMessages,
      { source: "assistant_stream" },
    );

    const mentionParse = parseAgentMentions(rendered, input.agent, allAgents);
    mentionParse.signals.forEach((signal) => enqueueHandoff(signal));
  }

  async function runAgentCollaborationReply(input: {
    agent: WorkspaceAgent;
    prompt: string;
    senderName: string;
  }) {
    const timestamp = new Date().toISOString();
    const previousThread = messagesByAgent[input.agent.id] ?? [];
    const userMessage: ChatMessage = {
      id: `${input.agent.id}-channel-user-${Date.now().toString(36)}`,
      agentId: input.agent.id,
      role: "user",
      sender: input.senderName,
      content: input.prompt,
      timestamp,
    };

    appendAgentMessage(input.agent.id, userMessage);
    void persistPhaseTwoMessage(
      {
        agentId: userMessage.agentId,
        role: userMessage.role,
        content: userMessage.content,
        sender: userMessage.sender,
      },
      previousThread.length + 1,
      { source: "channel_user_turn" },
    );

    const browserContextMessages: RuntimeChatMessage[] = [];
    let hasLiveResearchContext = false;
    if (
      shouldUseInteractiveBrowser(
        input.agent,
        input.prompt,
        Boolean(runtimeHealth.providers?.browserUse),
      )
    ) {
      const browserLaunch = await launchBrowserSessionForAgent({
        agent: input.agent,
        prompt: input.prompt,
        focusDrawer: false,
      });

      browserContextMessages.push(
        buildBrowserSessionContextMessage(browserLaunch),
      );
      const liveResearchContext = await collectLiveWebResearch({
        agent: input.agent,
        prompt: input.prompt,
      });
      if (liveResearchContext) {
        hasLiveResearchContext = true;
        browserContextMessages.push(liveResearchContext);
      }
    }

    if (
      input.agent.source === "custom" &&
      hasAgentRuntime &&
      runtimeHealth.ok
    ) {
      const memoryContext = await loadPhaseTwoMemoryContext(input.agent.id);
      const executionContextMessages: ChatMessage[] = [];
      const executionSteps: ExecutionStepResult[] = [];
      let finalReasoning = "";
      let loopBlocked = false;
      const seenCommands = new Set<string>();

      for (let stepIndex = 0; stepIndex < 4; stepIndex += 1) {
        const executionPlan = await planAgentExecution(
          input.agent,
          input.prompt,
          [...previousThread, userMessage, ...executionContextMessages],
        );

        if (!(executionPlan?.mode === "command" && executionPlan.command)) {
          finalReasoning = executionPlan?.reasoning || finalReasoning;
          break;
        }

        const commandSignature = `${executionPlan.cwd || input.agent.workspace || ""}::${executionPlan.command}`;
        if (seenCommands.has(commandSignature)) {
          finalReasoning =
            "Execution stopped because the same sandbox action was suggested again.";
          break;
        }

        seenCommands.add(commandSignature);
        const executionResult = await handleCommandExecutionRequest({
          agent: input.agent,
          command: executionPlan.command,
          cwd: executionPlan.cwd || input.agent.workspace || "",
          source: "agent",
        });

        if (!executionResult) {
          loopBlocked = true;
          finalReasoning =
            "Execution could not continue because the next sandbox action was blocked.";
          break;
        }

        executionSteps.push({
          command: executionPlan.command,
          cwd: executionPlan.cwd || input.agent.workspace || "",
          result: executionResult,
        });
        updateThoughtSnapshot({
          agentId: input.agent.id,
          thought:
            latestThoughtByAgentId[input.agent.id]?.thought ||
            finalReasoning ||
            "Prepared a sandbox step.",
          command: executionPlan.command,
          observation:
            executionResult.stdout?.slice(0, 240) ||
            executionResult.stderr?.slice(0, 240) ||
            executionResult.error ||
            `Exit code ${executionResult.exitCode ?? "unknown"}`,
        });

        executionContextMessages.push({
          id: `${input.agent.id}-channel-execution-step-${stepIndex}-${Date.now().toString(36)}`,
          agentId: input.agent.id,
          role: "system",
          sender: "Runtime",
          content: [
            `Completed sandbox step ${stepIndex + 1}.`,
            `Command: ${executionPlan.command}`,
            executionResult.cwd ? `Cwd: ${executionResult.cwd}` : "",
            typeof executionResult.exitCode === "number"
              ? `Exit code: ${executionResult.exitCode}`
              : "",
            executionResult.timedOut ? "The command timed out." : "",
            executionResult.stdout ? `stdout:\n${executionResult.stdout}` : "",
            executionResult.stderr ? `stderr:\n${executionResult.stderr}` : "",
            executionResult.error ? `error: ${executionResult.error}` : "",
            executionResult.artifacts?.length
              ? `artifacts:\n${executionResult.artifacts
                  .map(
                    (artifact) =>
                      artifact.path || artifact.url || artifact.name,
                  )
                  .filter(Boolean)
                  .join("\n")}`
              : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
          timestamp: new Date().toISOString(),
        });

        if (!executionResult.ok) {
          finalReasoning = "Execution stopped because a sandbox step failed.";
          break;
        }
      }

      if (loopBlocked) {
        const blockedText =
          "I couldn’t finish the full sandbox flow because the next step was blocked before execution. Check Activity for the command details.";
        appendAgentMessage(input.agent.id, {
          id: `${input.agent.id}-channel-assistant-${Date.now().toString(36)}`,
          agentId: input.agent.id,
          role: "assistant",
          sender: input.agent.name,
          content: blockedText,
          timestamp: new Date().toISOString(),
        });

        return {
          ok: false,
          text: blockedText,
        };
      }

      if (executionSteps.length > 0) {
        const summary = await summarizeAgentExecutionSequence({
          agent: input.agent,
          previousThread,
          userPrompt: input.prompt,
          steps: executionSteps,
          browserContextMessages,
          finalReasoning,
        });
        const critiqued = await runCritiquedText({
          agent: input.agent,
          prompt: input.prompt,
          text: summary,
          contextMessages: [
            ...memoryContext.runtimeMessages,
            ...toRuntimeConversation(
              [...previousThread, userMessage, ...executionContextMessages],
              attachmentLibrary,
            ),
            ...browserContextMessages,
          ],
        });

        appendAgentMessage(input.agent.id, {
          id: `${input.agent.id}-channel-assistant-${Date.now().toString(36)}`,
          agentId: input.agent.id,
          role: "assistant",
          sender: input.agent.name,
          content: critiqued.text,
          timestamp: new Date().toISOString(),
        });
        void persistPhaseTwoMessage(
          {
            agentId: input.agent.id,
            role: "assistant",
            content: critiqued.text,
            sender: input.agent.name,
          },
          previousThread.length + 2,
          { source: "channel_assistant_summary" },
        );

        return {
          ok: executionSteps[executionSteps.length - 1]?.result.ok ?? true,
          text: critiqued.text,
        };
      }

      const result = await sendAgentRuntimeChat({
        agent: withLiveWebContextPrompt(input.agent, {
          hasBrowserLane: browserContextMessages.length > 0,
          hasLiveResearch: hasLiveResearchContext,
        }),
        messages: [
          ...memoryContext.runtimeMessages,
          ...toRuntimeConversation(
            [...previousThread, userMessage],
            attachmentLibrary,
          ),
          ...browserContextMessages,
        ],
      });

      if (result.ok && result.text) {
        const critiqued = await runCritiquedText({
          agent: input.agent,
          prompt: input.prompt,
          text: result.text,
          contextMessages: [
            ...memoryContext.runtimeMessages,
            ...toRuntimeConversation(
              [...previousThread, userMessage],
              attachmentLibrary,
            ),
            ...browserContextMessages,
          ],
        });
        appendAgentMessage(input.agent.id, {
          id: `${input.agent.id}-channel-assistant-${Date.now().toString(36)}`,
          agentId: input.agent.id,
          role: "assistant",
          sender: input.agent.name,
          content: critiqued.text,
          timestamp: new Date().toISOString(),
        });
        void persistPhaseTwoMessage(
          {
            agentId: input.agent.id,
            role: "assistant",
            content: critiqued.text,
            sender: input.agent.name,
          },
          previousThread.length + 2,
          { source: "channel_assistant_reply" },
        );

        return {
          ok: true,
          text: critiqued.text,
        };
      }
    }

    const fallback = generateAgentReply(input.agent, input.prompt, delegations);
    appendAgentMessage(input.agent.id, {
      id: `${input.agent.id}-channel-assistant-${Date.now().toString(36)}`,
      agentId: input.agent.id,
      role: "assistant",
      sender: input.agent.name,
      content: fallback,
      timestamp: new Date().toISOString(),
    });

    return {
      ok: true,
      text: fallback,
    };
  }

  async function handleChannelCollaboration(
    channel: CollaborationChannel,
    prompt: string,
    options?: {
      expandedPrompt?: string;
      attachmentIds?: string[];
    },
  ) {
    if (isChannelCollaborating) {
      return null;
    }

    const trimmedPrompt = prompt.trim();
    const effectivePrompt = options?.expandedPrompt?.trim() || trimmedPrompt;
    if (!effectivePrompt) {
      return null;
    }

    const startedAt = new Date().toISOString();
    const lead = allAgents.find((agent) => agent.id === channel.leadAgentId);

    if (!lead) {
      return null;
    }

    const memberAgents = channel.memberAgentIds
      .map((agentId) => allAgents.find((agent) => agent.id === agentId))
      .filter(Boolean) as WorkspaceAgent[];
    const mentionedSlugs = extractMentionSlugs(effectivePrompt);
    const mentionedMembers = memberAgents.filter((member) =>
      mentionedSlugs.includes(slugifyLabel(member.name)),
    );
    const collaborators = (
      mentionedMembers.length > 0 ? mentionedMembers : memberAgents
    ).filter((member) => member.id !== lead.id);
    const initialAssignments =
      collaborators.length > 0 ? collaborators : [lead];

    appendChannelMessage(channel.id, {
      id: `${channel.id}-user-${Date.now().toString(36)}`,
      channelId: channel.id,
      sender: "You",
      senderId: null,
      role: "user",
      kind: "message",
      content:
        trimmedPrompt ||
        `Shared ${options?.attachmentIds?.length || 0} attachment${(options?.attachmentIds?.length || 0) === 1 ? "" : "s"}.`,
      contextText: effectivePrompt,
      attachmentIds: options?.attachmentIds || [],
      timestamp: startedAt,
    });
    setIsChannelCollaborating(true);
    updateChannel(channel.id, (current) => ({
      ...current,
      status: "active",
      updatedAt: startedAt,
    }));

    const kickoff = [
      `I’m opening a channel round for: ${trimmedPrompt || "the attached context"}`,
      initialAssignments.length > 0
        ? `I’m pulling in ${initialAssignments.map((agent) => `@${slugifyLabel(agent.name)}`).join(", ")} so we can split this cleanly.`
        : "I’ll keep this in the lead lane because no extra members were explicitly targeted.",
    ].join("\n\n");

    appendChannelMessage(channel.id, {
      id: `${channel.id}-lead-kickoff-${Date.now().toString(36)}`,
      channelId: channel.id,
      sender: lead.name,
      senderId: lead.id,
      role: "agent",
      kind: "message",
      content: kickoff,
      timestamp: new Date().toISOString(),
    });

    pushLiveActivity({
      id: `${channel.id}-collaboration-${Date.now().toString(36)}`,
      agentId: lead.id,
      kind: "delegation",
      label: "Channel Collaboration",
      detail: trimmedPrompt || "Reviewing attached context",
      status: "running",
      timestamp: startedAt,
    });

    const collaboratorOutputs: Array<{
      agent: WorkspaceAgent;
      text: string;
      ok: boolean;
    }> = [];
    const visitedAgents = new Set<string>();
    const pendingAssignments = initialAssignments.map((agent) => ({
      agent,
      requestedBy: lead,
      prompt: buildChannelTaskPrompt(
        lead,
        agent,
        effectivePrompt,
        channel.memberTargets[agent.id] || "",
      ),
    }));

    let roundNumber = 0;

    try {
      while (pendingAssignments.length > 0) {
        const queuedThisRound = pendingAssignments.splice(0);
        const currentWave = queuedThisRound.filter(
          (assignment, index, assignments) => {
            if (visitedAgents.has(assignment.agent.id)) {
              return false;
            }

            return (
              assignments.findIndex(
                (entry) => entry.agent.id === assignment.agent.id,
              ) === index
            );
          },
        );

        if (currentWave.length === 0) {
          break;
        }

        roundNumber += 1;

        appendChannelMessage(channel.id, {
          id: `${channel.id}-round-${roundNumber}-${Date.now().toString(36)}`,
          channelId: channel.id,
          sender: "Workspace",
          senderId: null,
          role: "system",
          kind: "task",
          content:
            currentWave.length > 1
              ? `Round ${roundNumber} is live. ${currentWave
                  .map(
                    (assignment) => `@${slugifyLabel(assignment.agent.name)}`,
                  )
                  .join(", ")} are working in parallel.`
              : `Round ${roundNumber} is live. @${slugifyLabel(currentWave[0]?.agent.name || "agent")} is taking the next focused slice.`,
          timestamp: new Date().toISOString(),
        });

        const waveResults = await Promise.all(
          currentWave.map(async (assignment) => {
            const collaborator = assignment.agent;
            visitedAgents.add(collaborator.id);

            if (collaborator.source === "custom") {
              updateCustomAgent(collaborator.id, (agent) => ({
                ...agent,
                status: "active",
                currentActivity: `Working in ${channel.title} · round ${roundNumber}`,
                lastSeen: new Date().toISOString(),
              }));
            }

            const task = normalizeDelegationTask({
              id: `channel-task-${channel.id}-${collaborator.id}-${Date.now().toString(36)}`,
              title: `${channel.title}: ${(trimmedPrompt || effectivePrompt).slice(0, 72)}`,
              fromAgentId: assignment.requestedBy.id,
              assigneeId: collaborator.id,
              status: "active",
              priority: "medium",
              notes: `Shared task channel: ${channel.title} · round ${roundNumber}`,
              executionMode: "thread",
              payload: assignment.prompt,
              cwd: collaborator.workspace || "",
              channelId: channel.id,
              updatedAt: new Date().toISOString(),
            });

            setDelegations((current) => [task, ...current]);
            updateChannel(channel.id, (current) => ({
              ...current,
              linkedDelegationIds: uniqueStrings([
                task.id,
                ...current.linkedDelegationIds,
              ]),
              updatedAt: new Date().toISOString(),
            }));

            appendChannelMessage(channel.id, {
              id: `${task.id}-handoff`,
              channelId: channel.id,
              sender: assignment.requestedBy.name,
              senderId: assignment.requestedBy.id,
              role: "agent",
              kind: "handoff",
              content: `Delegating to @${slugifyLabel(collaborator.name)}: ${task.payload || task.title}`,
              timestamp: new Date().toISOString(),
            });

            const response = await runAgentCollaborationReply({
              agent: collaborator,
              prompt: task.payload || task.title,
              senderName: `${lead.name} via ${channel.title}`,
            });

            if (collaborator.source === "custom") {
              updateCustomAgent(collaborator.id, (agent) => ({
                ...agent,
                status: response.ok ? "idle" : "error",
                currentActivity: response.ok
                  ? "Ready for the next delegated thread"
                  : `Blocked in ${channel.title}`,
                lastSeen: new Date().toISOString(),
              }));
            }

            return {
              assignment,
              collaborator,
              task,
              response,
            };
          }),
        );

        for (const { collaborator, task, response } of waveResults) {
          collaboratorOutputs.push({
            agent: collaborator,
            text: response.text,
            ok: response.ok,
          });

          updateDelegationTask(task.id, (current) => ({
            ...current,
            status: response.ok ? "done" : "blocked",
            updatedAt: new Date().toISOString(),
          }));

          appendChannelMessage(channel.id, {
            id: `${task.id}-result`,
            channelId: channel.id,
            sender: collaborator.name,
            senderId: collaborator.id,
            role: "agent",
            kind: "result",
            content: response.text,
            timestamp: new Date().toISOString(),
          });

          const handoffAgents = inferHandoffAgentsFromText(
            response.text,
            memberAgents,
            collaborator.id,
          )
            .filter((member) => !visitedAgents.has(member.id))
            .filter(
              (member) =>
                !pendingAssignments.some(
                  (assignment) => assignment.agent.id === member.id,
                ),
            );

          for (const handoffAgent of handoffAgents) {
            const handoffPrompt = buildChannelTaskPrompt(
              lead,
              handoffAgent,
              effectivePrompt,
              channel.memberTargets[handoffAgent.id] || "",
              `Requested by ${collaborator.name}:\n${response.text}`,
            );

            appendChannelMessage(channel.id, {
              id: `${task.id}-followup-${handoffAgent.id}`,
              channelId: channel.id,
              sender: collaborator.name,
              senderId: collaborator.id,
              role: "agent",
              kind: "handoff",
              content: `I’m pulling in @${slugifyLabel(handoffAgent.name)} next for a focused slice in this room.`,
              timestamp: new Date().toISOString(),
            });

            pendingAssignments.push({
              agent: handoffAgent,
              requestedBy: collaborator,
              prompt: handoffPrompt,
            });
          }
        }

        appendChannelMessage(channel.id, {
          id: `${channel.id}-lead-review-${roundNumber}-${Date.now().toString(36)}`,
          channelId: channel.id,
          sender: lead.name,
          senderId: lead.id,
          role: "agent",
          kind: "message",
          content: buildChannelRoundReview(
            lead,
            roundNumber,
            waveResults.map(({ collaborator, response }) => ({
              collaborator,
              response,
            })),
            pendingAssignments,
          ),
          timestamp: new Date().toISOString(),
        });
      }

      const finalSummary = buildChannelLeadSummary(
        lead,
        effectivePrompt,
        collaboratorOutputs,
      );
      appendChannelMessage(channel.id, {
        id: `${channel.id}-lead-summary-${Date.now().toString(36)}`,
        channelId: channel.id,
        sender: lead.name,
        senderId: lead.id,
        role: "agent",
        kind: "message",
        content: finalSummary,
        timestamp: new Date().toISOString(),
      });

      updateChannel(channel.id, (current) => ({
        ...current,
        lastSummary: finalSummary,
        status: collaboratorOutputs.some((entry) => !entry.ok)
          ? "blocked"
          : "active",
        updatedAt: new Date().toISOString(),
      }));

      return {
        channelId: channel.id,
        finalSummary,
        collaboratorOutputs,
      };
    } finally {
      setIsChannelCollaborating(false);
    }
  }

  function formatDelegationInstruction(
    task: DelegationTask,
    ownerName: string,
  ) {
    if (task.executionMode === "command") {
      return task.payload.trim() || task.title;
    }

    const payload = task.payload.trim();
    if (payload) {
      return payload;
    }

    return [
      `Delegated by ${ownerName}.`,
      `Task: ${task.title}`,
      task.notes ? `Notes: ${task.notes}` : "",
      "Take ownership of this task, propose the next step, and move it forward.",
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  function blockCommandExecution(input: {
    agent: WorkspaceAgent;
    command: string;
    review: CommandReview;
    source: CommandExecutionSource;
    cwd: string;
    task?: DelegationTask;
    ownerName?: string;
    errorMessage?: string;
  }) {
    const blockedAt = new Date().toISOString();
    const message =
      input.errorMessage ||
      input.review.reasons[0] ||
      "This command was blocked before execution.";
    const summary = formatCommandReviewContent(
      input.command,
      input.review.reasons.length > 0 ? input.review.reasons : [message],
      input.source === "delegation"
        ? `Delegated command from ${input.ownerName ?? "Orchestrator"} was blocked before execution.`
        : "Command blocked before execution.",
    );

    appendAgentMessage(input.agent.id, {
      id: `${input.task?.id ?? input.agent.id}-command-blocked-${Date.now().toString(36)}`,
      agentId: input.agent.id,
      role: "system",
      sender: "Sandbox",
      content: summary,
      timestamp: blockedAt,
    });

    pushLiveActivity({
      id: `${input.task?.id ?? input.agent.id}-command-blocked-activity-${Date.now().toString(36)}`,
      agentId: input.agent.id,
      kind: "sandbox",
      label: "Sandbox Blocked",
      detail: message,
      status: "failed",
      timestamp: blockedAt,
    });

    if (input.source === "runner") {
      setCommandError(message);
    }

    if (input.task) {
      updateDelegationTask(input.task.id, (current) => ({
        ...current,
        status: "blocked",
        updatedAt: blockedAt,
      }));
    }
  }

  function requestCommandApproval(input: {
    agent: WorkspaceAgent;
    command: string;
    cwd: string;
    source: CommandExecutionSource;
    reasons: string[];
    task?: DelegationTask;
    ownerName?: string;
  }) {
    const requestedAt = new Date().toISOString();
    const queueId = enqueueApproval({
      agentId: input.agent.id,
      agentName: input.agent.name,
      agentEmoji: input.agent.emoji,
      command: input.command,
      cwd: input.cwd,
      riskReport: assessCommandRisk(input.command, input.cwd),
      source: input.source,
    });
    const summary = formatCommandReviewContent(
      input.command,
      input.reasons,
      input.source === "delegation"
        ? `Delegated command from ${input.ownerName ?? "Orchestrator"} is waiting for approval.`
        : "Command is waiting for approval before execution.",
    );

    appendAgentMessage(input.agent.id, {
      id: `${input.task?.id ?? input.agent.id}-command-review-${Date.now().toString(36)}`,
      agentId: input.agent.id,
      role: "system",
      sender: "Sandbox",
      content: summary,
      timestamp: requestedAt,
    });

    pushLiveActivity({
      id: `${input.task?.id ?? input.agent.id}-command-approval-activity-${Date.now().toString(36)}`,
      agentId: input.agent.id,
      kind: "sandbox",
      label: "Awaiting Approval",
      detail:
        input.reasons[0] ||
        "Sandbox approval is required before the command can run.",
      status: "idle",
      timestamp: requestedAt,
    });

    if (input.source === "runner") {
      setCommandError("Approval required before this command can run.");
    }

    setPendingCommandApproval({
      agentId: input.agent.id,
      queueId,
      command: input.command,
      cwd: input.cwd,
      source: input.source,
      taskId: input.task?.id ?? null,
      ownerName: input.ownerName ?? null,
      taskTitle: input.task?.title ?? null,
      reasons: input.reasons,
      requestedAt,
    });
  }

  async function runCommandForAgent(input: {
    agent: WorkspaceAgent;
    command: string;
    cwd: string;
    source: CommandExecutionSource;
    task?: DelegationTask;
    ownerName?: string;
  }) {
    const createdAt = new Date().toISOString();
    const resolvedCwd = input.cwd.trim() || input.agent.workspace || "";
    const runId = input.task
      ? `${input.task.id}-run`
      : `run-${input.agent.id}-${Date.now().toString(36)}`;
    const activityId = `${runId}-activity`;
    const isRunnerFlow = input.source === "runner";

    if (input.agent.source !== "custom") {
      blockCommandExecution({
        ...input,
        review: {
          status: "blocked",
          reasons: [
            "Connected runtime profiles cannot execute sandbox commands from this workspace yet.",
          ],
        },
        errorMessage:
          "Connected runtime profiles cannot execute sandbox commands from this workspace yet.",
      });
      return null;
    }

    if (!input.agent.permissions.terminal) {
      blockCommandExecution({
        ...input,
        review: {
          status: "blocked",
          reasons: ["This agent is not terminal-enabled."],
        },
        errorMessage: "This agent is not terminal-enabled.",
      });
      return null;
    }

    if (!input.agent.workspace) {
      blockCommandExecution({
        ...input,
        review: {
          status: "blocked",
          reasons: [
            "This agent needs a workspace path before sandbox commands can run.",
          ],
        },
        errorMessage:
          "This agent needs a workspace path before sandbox commands can run.",
      });
      return null;
    }

    if (!hasAgentRuntime || !runtimeHealth.ok) {
      blockCommandExecution({
        ...input,
        review: {
          status: "blocked",
          reasons: [
            "Local runtime is offline, so the sandbox command could not run.",
          ],
        },
        errorMessage:
          "Local runtime is offline, so the sandbox command could not run.",
      });
      return null;
    }

    if (isRunnerFlow) {
      setCommandError(null);
      setIsExecutingCommand(true);
    }

    if (input.task) {
      updateDelegationTask(input.task.id, (current) => ({
        ...current,
        status: "active",
        updatedAt: createdAt,
      }));
    }

    setCommandRuns((current) => [
      {
        id: runId,
        agentId: input.agent.id,
        command: input.command,
        cwd: resolvedCwd,
        status: "running" as const,
        phase: "executing" as const,
        exitCode: null,
        stdout: "",
        stderr: "",
        timedOut: false,
        durationMs: null,
        createdAt,
        activityKind: "sandbox",
        activityLabel:
          input.source === "delegation"
            ? "Delegated Sandbox"
            : input.source === "agent"
              ? "Using Sandbox"
              : "Manual Sandbox",
        activitySummary: input.command,
      },
      ...current,
    ]);

    pushLiveActivity({
      id: activityId,
      agentId: input.agent.id,
      kind: "sandbox",
      label:
        input.source === "delegation"
          ? "Delegated Sandbox"
          : input.source === "agent"
            ? "Using Sandbox"
            : "Manual Sandbox",
      detail: input.command,
      status: "running",
      timestamp: createdAt,
    });

    updateCustomAgent(input.agent.id, (agent) => ({
      ...agent,
      status: "active",
      currentActivity:
        input.source === "delegation"
          ? `Running delegated command: ${input.task?.title ?? input.command.slice(0, 42)}`
          : input.source === "agent"
            ? `Working in sandbox: ${input.command.slice(0, 42)}${input.command.length > 42 ? "..." : ""}`
            : `Executing command: ${input.command.slice(0, 42)}${input.command.length > 42 ? "..." : ""}`,
      lastSeen: createdAt,
    }));

    const collectedArtifacts: RuntimeArtifact[] = [];
    const result = await executeAgentRuntimeCommandStream(
      {
        agent: input.agent,
        command: input.command,
        cwd: resolvedCwd,
      },
      (event: RuntimeExecuteStreamEvent) => {
        if (event.type === "started") {
          const activityKind = toLiveActivityKind(event.activity?.kind);
          const activityLabel =
            event.activity?.label ||
            (input.source === "delegation"
              ? "Delegated Sandbox"
              : input.source === "agent"
                ? "Using Sandbox"
                : "Manual Sandbox");
          const activitySummary = event.activity?.summary || input.command;

          setCommandRuns((current) =>
            current.map((run) =>
              run.id === runId
                ? {
                    ...run,
                    runtimeRunId: event.runId,
                    phase: event.phase,
                    activityKind,
                    activityLabel,
                    activitySummary,
                  }
                : run,
            ),
          );

          updateLiveActivity(activityId, (entry) => ({
            ...entry,
            kind: activityKind,
            label:
              input.source === "delegation"
                ? `Delegated · ${activityLabel}`
                : activityLabel,
            detail: activitySummary,
          }));

          updateCustomAgent(input.agent.id, (agent) => ({
            ...agent,
            status: "active",
            currentActivity: `${activityLabel}: ${input.command.slice(0, 42)}${input.command.length > 42 ? "..." : ""}`,
            lastSeen: createdAt,
          }));
        }

        if (event.type === "stdout" && event.chunk) {
          const chunk = event.chunk;
          setCommandRuns((current) =>
            current.map((run) =>
              run.id === runId
                ? {
                    ...run,
                    stdout: `${run.stdout}${chunk}`,
                  }
                : run,
            ),
          );

          updateLiveActivity(activityId, (entry) => ({
            ...entry,
            detail:
              formatTerminalChunk("stdout", chunk)
                .replace(/^stdout:\s*/gm, "")
                .slice(-180) || entry.detail,
          }));
        }

        if (event.type === "stderr" && event.chunk) {
          const chunk = event.chunk;
          setCommandRuns((current) =>
            current.map((run) =>
              run.id === runId
                ? {
                    ...run,
                    stderr: `${run.stderr}${chunk}`,
                  }
                : run,
            ),
          );

          updateLiveActivity(activityId, (entry) => ({
            ...entry,
            detail:
              formatTerminalChunk("stderr", chunk)
                .replace(/^stderr:\s*/gm, "")
                .slice(-180) || entry.detail,
            status: "running",
          }));
        }

        if (event.type === "artifact" && event.artifact) {
          const nextArtifact = event.artifact;
          const alreadyTracked = collectedArtifacts.some(
            (artifact) =>
              (artifact.path || artifact.url || artifact.name) ===
              (nextArtifact.path || nextArtifact.url || nextArtifact.name),
          );
          if (!alreadyTracked) {
            collectedArtifacts.push(nextArtifact);
          }

          setCommandRuns((current) =>
            current.map((run) =>
              run.id === runId
                ? {
                    ...run,
                    artifacts: [...(run.artifacts ?? []), nextArtifact],
                  }
                : run,
            ),
          );
        }
      },
    );
    const completedAt = new Date().toISOString();

    const normalizedRun: CommandRun = {
      id: runId,
      agentId: input.agent.id,
      command: input.command,
      cwd: result.cwd || resolvedCwd,
      status: result.ok ? "completed" : "failed",
      phase: result.ok ? "completed" : "failed",
      exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      timedOut: Boolean(result.timedOut),
      durationMs:
        typeof result.durationMs === "number" ? result.durationMs : null,
      createdAt,
      runtimeRunId: result.runId,
      activityKind: toLiveActivityKind(result.activity?.kind),
      activityLabel: result.activity?.label || "Sandbox Run",
      activitySummary: result.activity?.summary || input.command,
      artifacts: result.artifacts ?? collectedArtifacts,
    };

    setCommandRuns((current) =>
      current.map((run) => (run.id === runId ? normalizedRun : run)),
    );

    const actionLabel = normalizedRun.activityLabel || "Sandbox Run";
    const actionLabelLower = actionLabel.toLowerCase();

    const summaryLines = [
      input.source === "delegation"
        ? result.ok
          ? `Delegated ${actionLabelLower} completed successfully.`
          : `Delegated ${actionLabelLower} failed.`
        : result.ok
          ? `${actionLabel} completed successfully${typeof result.exitCode === "number" ? ` with exit code ${result.exitCode}` : ""}.`
          : `${actionLabel} failed${typeof result.exitCode === "number" ? ` with exit code ${result.exitCode}` : ""}.`,
      normalizedRun.durationMs !== null
        ? `Duration: ${normalizedRun.durationMs}ms.`
        : "",
      normalizedRun.cwd ? `Cwd: ${normalizedRun.cwd}` : "",
      normalizedRun.timedOut ? "The run timed out." : "",
      normalizedRun.artifacts?.length
        ? `artifacts:\n${normalizedRun.artifacts
            .map((artifact) => artifact.path || artifact.url || artifact.name)
            .filter(Boolean)
            .join("\n")}`
        : "",
      normalizedRun.stdout ? `stdout:\n${normalizedRun.stdout}` : "",
      normalizedRun.stderr ? `stderr:\n${normalizedRun.stderr}` : "",
      !result.ok && result.error ? `error: ${result.error}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    updateLiveActivity(activityId, (entry) => ({
      ...entry,
      status: result.ok ? "completed" : "failed",
      detail: result.ok
        ? `Exit ${typeof result.exitCode === "number" ? result.exitCode : 0}${typeof result.durationMs === "number" ? ` in ${result.durationMs}ms` : ""}`
        : result.error ||
          `Exit ${typeof result.exitCode === "number" ? result.exitCode : 1}`,
      timestamp: completedAt,
    }));

    if (input.task) {
      updateDelegationTask(input.task.id, (current) => ({
        ...current,
        status: result.ok ? "done" : "blocked",
        updatedAt: completedAt,
      }));
    }

    if (!result.ok) {
      const errorMessage = result.error || "The runtime command failed.";
      addLearningEvent(
        input.agent.id,
        input.agent.name,
        result.timedOut ? "timeout" : "tool_failure",
        errorMessage,
        { command: input.command, cwd: resolvedCwd },
      );

      if (isRunnerFlow) {
        setCommandError(errorMessage);
      }

      updateCustomAgent(input.agent.id, (agent) => ({
        ...agent,
        status: "error",
        currentActivity:
          input.source === "delegation"
            ? `Delegated ${actionLabelLower} failed`
            : input.source === "agent"
              ? `${actionLabel} failed`
              : `${actionLabel} failed`,
        lastSeen: completedAt,
      }));

      if (isRunnerFlow) {
        setIsExecutingCommand(false);
      }

      return result;
    }

    updateCustomAgent(input.agent.id, (agent) => ({
      ...agent,
      status: "idle",
      currentActivity:
        input.source === "delegation"
          ? `Ready after delegated ${actionLabelLower}`
          : input.source === "agent"
            ? `Ready after ${actionLabelLower}`
            : `Ready after ${actionLabelLower}`,
      lastSeen: completedAt,
    }));

    if (isRunnerFlow) {
      setCommandDraft("");
      setIsExecutingCommand(false);
    }

    return result;
  }

  async function handleCommandExecutionRequest(input: {
    agent: WorkspaceAgent;
    command: string;
    cwd: string;
    source: CommandExecutionSource;
    task?: DelegationTask;
    ownerName?: string;
  }) {
    const review = reviewCommand(input.command, input.agent.sandboxMode);
    const autoApprove =
      review.status === "approval" &&
      shouldAutoApproveWorkspaceCommand(input.agent);

    if (review.status === "blocked") {
      blockCommandExecution({
        ...input,
        review,
      });
      return null;
    }

    if (review.status === "approval" && !autoApprove) {
      requestCommandApproval({
        ...input,
        reasons: review.reasons,
      });
      return null;
    }

    return runCommandForAgent(input);
  }

  function handleCancelCommandApproval() {
    if (!pendingCommandApproval) {
      return;
    }

    const dismissedAt = new Date().toISOString();
    const approval = pendingCommandApproval;
    const agent = allAgents.find(
      (candidate) => candidate.id === approval.agentId,
    );
    setPendingCommandApproval(null);

    if (approval.queueId) {
      dismissApprovalQueueItem(approval.queueId);
    }

    if (approval.source === "runner") {
      setCommandError(
        "Command approval was dismissed. Adjust it or approve it when you're ready.",
      );

      if (agent) {
        appendAgentMessage(agent.id, {
          id: `${agent.id}-command-review-dismissed-${Date.now().toString(36)}`,
          agentId: agent.id,
          role: "system",
          sender: "Sandbox",
          content: `Command review dismissed for \`${approval.command}\`. No execution started.`,
          timestamp: dismissedAt,
        });
      }

      return;
    }

    if (approval.taskId) {
      updateDelegationTask(approval.taskId, (current) => ({
        ...current,
        status: "blocked",
        updatedAt: dismissedAt,
      }));
    }

    if (agent) {
      appendAgentMessage(agent.id, {
        id: `${approval.taskId ?? agent.id}-command-review-dismissed-${Date.now().toString(36)}`,
        agentId: agent.id,
        role: "system",
        sender: "Sandbox",
        content: `Delegated command approval was dismissed for \`${approval.command}\`. Retry the task when you're ready.`,
        timestamp: dismissedAt,
      });
    }
  }

  async function handleApproveCommandApproval() {
    if (!pendingCommandApproval || isProcessingCommandApproval) {
      return;
    }

    const approval = pendingCommandApproval;
    const agent = allAgents.find(
      (candidate) => candidate.id === approval.agentId,
    );
    const task = approval.taskId
      ? delegations.find((candidate) => candidate.id === approval.taskId)
      : undefined;
    setPendingCommandApproval(null);
    setIsProcessingCommandApproval(true);

    if (!agent) {
      if (approval.queueId) {
        resolveApprovalQueueItem(approval.queueId, "rejected");
      }
      if (approval.source === "runner") {
        setCommandError(
          "The selected agent is no longer available for this command.",
        );
      } else if (approval.taskId) {
        updateDelegationTask(approval.taskId, (current) => ({
          ...current,
          status: "blocked",
          updatedAt: new Date().toISOString(),
        }));
      }

      setIsProcessingCommandApproval(false);
      return;
    }

    if (approval.source === "delegation" && approval.taskId && !task) {
      if (approval.queueId) {
        resolveApprovalQueueItem(approval.queueId, "rejected");
      }
      appendAgentMessage(agent.id, {
        id: `${agent.id}-command-review-missing-task-${Date.now().toString(36)}`,
        agentId: agent.id,
        role: "system",
        sender: "Sandbox",
        content: `The original delegation for \`${approval.command}\` is no longer available, so the command was not started.`,
        timestamp: new Date().toISOString(),
      });
      setIsProcessingCommandApproval(false);
      return;
    }

    try {
      if (approval.queueId) {
        resolveApprovalQueueItem(approval.queueId, "approved");
      }
      await runCommandForAgent({
        agent,
        command: approval.command,
        cwd: approval.cwd,
        source: approval.source,
        task,
        ownerName: approval.ownerName ?? undefined,
      });
    } finally {
      setIsProcessingCommandApproval(false);
    }
  }

  function handleApprovePlanReview() {
    if (!activePlanReview) {
      return;
    }
    resolvePlanReview(activePlanReview.id, "approved");
    setActivePlanReviewId(null);
  }

  function handleRejectPlanReview() {
    if (!activePlanReview) {
      setActivePlanReviewId(null);
      return;
    }
    resolvePlanReview(activePlanReview.id, "rejected");
    setActivePlanReviewId(null);
  }

  function handleCreateAgentFromBlueprint(blueprint: {
    name: string;
    emoji: string;
    objective: string;
    systemPrompt: string;
    provider: string;
    model: string;
    sandboxMode: SandboxMode;
    permissions: AgentPermissions;
  }) {
    const nextAgent: WorkspaceAgent = {
      id: `custom-${(blueprint.name.trim() || "specialist-agent").toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`,
      name: blueprint.name.trim() || "Specialist Agent",
      subtitle: blueprint.objective.trim() || `${blueprint.provider} specialist`,
      type: "Custom Agent",
      role: blueprint.objective.trim() || "Specialist",
      accent: pickAccent(customAgents.length),
      status: "idle",
      currentActivity: "Waiting for a task or prompt",
      lastSeen: new Date().toISOString(),
      tasksCompleted: 0,
      accuracy: 95,
      skills: [],
      source: "custom",
      provider: blueprint.provider.trim() || "Anthropic",
      model: blueprint.model.trim() || "claude-3-7-sonnet",
      objective: blueprint.objective.trim() || "Specialist support",
      systemPrompt: blueprint.systemPrompt.trim(),
      specialties: [],
      tools: deriveTools(blueprint.permissions),
      workspace: DEFAULT_AGENT_WORKSPACE,
      sandboxMode: blueprint.sandboxMode,
      permissions: blueprint.permissions,
      emoji: blueprint.emoji.trim() || "🤖",
    };

    setCustomAgents((current) => [nextAgent, ...current]);
    setMessagesByAgent((current) => ({
      ...current,
      [nextAgent.id]: buildWelcomeThread(nextAgent),
    }));
    setSelectedAgentId(nextAgent.id);
    setPendingBlueprint(null);
    setWorkspaceView("chat");
  }

  async function handleStartCopilotAuth() {
    if (!hasAgentRuntime) {
      setCopilotAuthError("Local runtime URL is not configured.");
      return;
    }

    setCopilotAuthError(null);
    setIsStartingCopilotAuth(true);

    const result = await startGithubCopilotDeviceAuth();
    setIsStartingCopilotAuth(false);

    if (
      !result.ok ||
      !result.deviceCode ||
      !result.userCode ||
      !result.verificationUri
    ) {
      setCopilotAuthError(
        result.error || "Unable to start Copilot login from the local runtime.",
      );
      return;
    }

    const interval = Math.max(2, Number(result.interval || 5));
    const expiresIn = Math.max(60, Number(result.expiresIn || 900));

    setCopilotAuthSession({
      deviceCode: result.deviceCode,
      userCode: result.userCode,
      verificationUri: result.verificationUri,
      verificationUriComplete: result.verificationUriComplete || "",
      interval,
      expiresAt: Date.now() + expiresIn * 1000,
    });
    setIsCopilotAuthDialogOpen(true);
  }

  async function handleDisconnectCopilotAuth() {
    if (!hasAgentRuntime) {
      return;
    }

    setCopilotAuthError(null);
    const result = await logoutGithubCopilotAuth();

    if (!result.ok) {
      setCopilotAuthError(result.error || "Unable to clear Copilot login.");
      return;
    }

    setCopilotAuthSession(null);
    setIsCopilotAuthDialogOpen(false);
    await refreshRuntimeHealth();
  }

  async function handleToolApprovalAction(
    action: "approve" | "reject" | "edit",
  ) {
    if (!toolApproval) return;

    setToolApproval((current) =>
      current ? { ...current, isResolving: true } : current,
    );

    const result = await resolveToolApproval({
      approvalRequestId: toolApproval.request.id,
      action,
      editedParameters:
        action === "edit" ? toolApproval.editedParameters : undefined,
    });

    if (result.ok && result.result) {
      setToolInvocationResults((current) =>
        [result.result!, ...current].slice(0, 40),
      );
    }

    setToolApproval(null);

    if (result.ok && result.result?.ok) {
      appendAgentMessage(toolApproval.request.agentId, {
        id: `${toolApproval.request.id}-tool-approved-${Date.now().toString(36)}`,
        agentId: toolApproval.request.agentId,
        role: "system",
        sender: "Tools",
        content: `Approved ${toolApproval.request.tool} execution. ${result.result?.data ? `Completed in ${result.result.data.durationMs || 0}ms.` : ""}`,
        timestamp: new Date().toISOString(),
      });
    } else if (action === "reject") {
      const agent = allAgents.find(
        (a) => a.id === toolApproval.request.agentId,
      );
      if (agent) {
        appendAgentMessage(agent.id, {
          id: `${toolApproval.request.id}-tool-rejected-${Date.now().toString(36)}`,
          agentId: agent.id,
          role: "system",
          sender: "Tools",
          content: `Rejected ${toolApproval.request.tool} execution.`,
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  async function handleInvokeTool(
    agent: WorkspaceAgent,
    toolName: ToolName,
    parameters: Record<string, unknown>,
  ) {
    if (!hasAgentRuntime || !runtimeHealth.ok) {
      return {
        ok: false,
        tool: toolName,
        error: "Runtime is not available.",
      } as ToolInvocationResult;
    }

    pushLiveActivity({
      id: `${agent.id}-tool-${Date.now().toString(36)}`,
      agentId: agent.id,
      kind: toLiveActivityKind(
        toolName === "shell.exec"
          ? "sandbox"
          : toolName === "code.search"
            ? "search"
            : toolName.startsWith("filesystem")
              ? "read"
              : toolName.startsWith("git")
                ? "git"
                : "typing",
      ),
      label: toolName,
      detail: JSON.stringify(parameters).slice(0, 180),
      status: "running",
      timestamp: new Date().toISOString(),
    });

    const result = await invokeTool({
      tool: toolName,
      agentId: agent.id,
      parameters,
      workspacePath: agent.workspace,
      sandboxMode: agent.sandboxMode,
    });

    if (result.approvalRequired && result.approvalRequestId) {
      const approvalRequest: ToolApprovalRequest = {
        id: result.approvalRequestId,
        tool: toolName,
        agentId: agent.id,
        agentName: agent.name,
        parameters,
        riskLevel:
          (result.approvalReasons?.length ?? 0) > 0 ? "high" : "medium",
        reasons: result.approvalReasons ?? [],
        preview: {},
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      };

      setToolApproval({
        request: approvalRequest,
        isResolving: false,
        editMode: false,
        editedParameters: { ...parameters },
      });

      return result;
    }

    setToolInvocationResults((current) => [result, ...current].slice(0, 40));
    return result;
  }

  function handleCreateAgent() {
    const trimmedName = agentDraft.name.trim();
    if (!trimmedName) {
      return;
    }
    const resolvedWorkspace = resolveWorkspacePath(agentDraft.workspace);

    const permissions: AgentPermissions = {
      terminal: agentDraft.terminal,
      browser: agentDraft.browser,
      files: agentDraft.files,
      git: agentDraft.git,
      delegation: agentDraft.delegation,
    };

    if (editingAgentId) {
      setCustomAgents((current) =>
        current.map((agent) => {
          if (agent.id !== editingAgentId) return agent;
          return {
            ...agent,
            name: trimmedName,
            emoji: agentDraft.emoji.trim() || agent.emoji,
            subtitle:
              agentDraft.objective.trim() ||
              `${agentDraft.provider} specialist`,
            role: agentDraft.role.trim() || agent.role,
            provider: agentDraft.provider.trim() || agent.provider,
            model: agentDraft.model.trim() || agent.model,
            objective: agentDraft.objective.trim() || agent.objective,
            systemPrompt: agentDraft.systemPrompt.trim() || agent.systemPrompt,
            specialties: parseList(agentDraft.specialties),
            skills: parseList(agentDraft.skills),
            workspace: resolvedWorkspace,
            sandboxMode: agentDraft.sandboxMode,
            permissions,
            tools: deriveTools(permissions),
          };
        }),
      );
      setEditingAgentId(null);
      setAgentDraft(emptyAgentDraft);
      setIsCreateAgentOpen(false);
      return;
    }

    const nextAgent: WorkspaceAgent = {
      id: `custom-${trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now().toString(36)}`,
      name: trimmedName,
      emoji: agentDraft.emoji.trim() || "🤖",
      subtitle:
        agentDraft.objective.trim() || `${agentDraft.provider} specialist`,
      type: "Custom Agent",
      role: agentDraft.role.trim() || "Specialist",
      accent: pickAccent(customAgents.length),
      status: "idle",
      currentActivity: "Waiting for a task or prompt",
      lastSeen: new Date().toISOString(),
      tasksCompleted: 0,
      accuracy: 95,
      skills: parseList(agentDraft.skills),
      source: "custom",
      provider: agentDraft.provider.trim() || "OpenAI",
      model: agentDraft.model.trim() || "gpt-4.1",
      objective:
        agentDraft.objective.trim() ||
        "Help inside the control room and take on focused specialist work.",
      systemPrompt:
        agentDraft.systemPrompt.trim() ||
        "You are a custom agent inside a personal multi-agent workspace. Stay in your lane and execute clearly.",
      specialties: parseList(agentDraft.specialties),
      tools: deriveTools(permissions),
      workspace: resolvedWorkspace,
      sandboxMode: agentDraft.sandboxMode,
      permissions,
    };

    setCustomAgents((current) => [nextAgent, ...current]);
    setMessagesByAgent((current) => ({
      ...current,
      [nextAgent.id]: buildWelcomeThread(nextAgent),
    }));
    setSelectedAgentId(nextAgent.id);
    setAgentDraft(emptyAgentDraft);
    setIsCreateAgentOpen(false);
  }

  function handleEditAgent(agent: WorkspaceAgent) {
    setEditingAgentId(agent.id);
    setAgentDraft({
      name: agent.name,
      role: agent.role,
      emoji: agent.emoji,
      provider: agent.provider,
      model: agent.model,
      objective: agent.objective,
      systemPrompt: agent.systemPrompt,
      specialties: (agent.specialties || []).join(", "),
      skills: (agent.skills || []).join(", "),
      workspace: resolveWorkspacePath(agent.workspace),
      sandboxMode: agent.sandboxMode,
      terminal: agent.permissions.terminal,
      browser: agent.permissions.browser,
      files: agent.permissions.files,
      git: agent.permissions.git,
      delegation: agent.permissions.delegation,
    });
    setIsCreateAgentOpen(true);
  }

  async function dispatchDelegationTask(task: DelegationTask) {
    const assignee = allAgents.find((agent) => agent.id === task.assigneeId);
    const owner = allAgents.find((agent) => agent.id === task.fromAgentId);
    const ownerName = owner?.name ?? "Orchestrator";
    const startedAt = new Date().toISOString();

    if (!assignee) {
      updateDelegationTask(task.id, (current) => ({
        ...current,
        status: "blocked",
        updatedAt: startedAt,
      }));
      return;
    }

    updateDelegationTask(task.id, (current) => ({
      ...current,
      status: "active",
      updatedAt: startedAt,
    }));

    if (task.channelId) {
      appendChannelMessage(task.channelId, {
        id: `${task.id}-channel-dispatch`,
        channelId: task.channelId,
        sender: ownerName,
        senderId: owner?.id || null,
        role: "agent",
        kind: "handoff",
        content: `Dispatching ${task.executionMode} task to @${slugifyLabel(assignee.name)}: ${task.title}`,
        timestamp: startedAt,
      });
    }

    if (task.executionMode === "manual") {
      appendAgentMessage(assignee.id, {
        id: `${task.id}-manual-note`,
        agentId: assignee.id,
        role: "system",
        sender: "Delegation",
        content: `New manual task from ${ownerName}: ${task.title}${task.notes ? `\n\n${task.notes}` : ""}`,
        timestamp: startedAt,
      });
      if (task.channelId) {
        appendChannelMessage(task.channelId, {
          id: `${task.id}-manual-channel-note`,
          channelId: task.channelId,
          sender: assignee.name,
          senderId: assignee.id,
          role: "agent",
          kind: "result",
          content: `Manual task received. I’ll pick this up from my direct lane and report back here once it moves.`,
          timestamp: new Date().toISOString(),
        });
      }
      return;
    }

    if (task.executionMode === "thread") {
      const instruction = formatDelegationInstruction(task, ownerName);
      const delegateMessage: ChatMessage = {
        id: `${task.id}-thread-user`,
        agentId: assignee.id,
        role: "user",
        sender: ownerName,
        content: instruction,
        timestamp: startedAt,
      };

      appendAgentMessage(assignee.id, delegateMessage);

      if (assignee.source === "custom" && hasAgentRuntime && runtimeHealth.ok) {
        updateCustomAgent(assignee.id, (agent) => ({
          ...agent,
          status: "active",
          currentActivity: `Handling delegated task: ${task.title}`,
          lastSeen: startedAt,
        }));

        const result = await sendAgentRuntimeChat({
          agent: assignee,
          messages: [...(messagesByAgent[assignee.id] ?? []), delegateMessage],
        });

        if (!result.ok || !result.text) {
          const errorMessage =
            result.error || "Delegated thread execution failed.";
          appendAgentMessage(assignee.id, {
            id: `${task.id}-thread-error`,
            agentId: assignee.id,
            role: "system",
            sender: "Runtime",
            content: `Delegation failed: ${errorMessage}`,
            timestamp: new Date().toISOString(),
          });
          updateDelegationTask(task.id, (current) => ({
            ...current,
            status: "blocked",
            updatedAt: new Date().toISOString(),
          }));
          updateCustomAgent(assignee.id, (agent) => ({
            ...agent,
            status: "error",
            currentActivity: "Delegated task hit a runtime error",
            lastSeen: new Date().toISOString(),
          }));
          return;
        }

        appendAgentMessage(assignee.id, {
          id: `${task.id}-thread-assistant`,
          agentId: assignee.id,
          role: "assistant",
          sender: assignee.name,
          content: result.text,
          timestamp: new Date().toISOString(),
        });
        if (task.channelId) {
          appendChannelMessage(task.channelId, {
            id: `${task.id}-thread-channel-result`,
            channelId: task.channelId,
            sender: assignee.name,
            senderId: assignee.id,
            role: "agent",
            kind: "result",
            content: result.text,
            timestamp: new Date().toISOString(),
          });
        }
        updateCustomAgent(assignee.id, (agent) => ({
          ...agent,
          status: "idle",
          currentActivity: "Ready for the next delegated thread",
          lastSeen: new Date().toISOString(),
        }));
      } else {
        appendAgentMessage(assignee.id, {
          id: `${task.id}-thread-fallback`,
          agentId: assignee.id,
          role: "assistant",
          sender: assignee.name,
          content: generateAgentReply(assignee, instruction, delegations),
          timestamp: new Date().toISOString(),
        });
        if (task.channelId) {
          appendChannelMessage(task.channelId, {
            id: `${task.id}-thread-channel-fallback`,
            channelId: task.channelId,
            sender: assignee.name,
            senderId: assignee.id,
            role: "agent",
            kind: "result",
            content: generateAgentReply(assignee, instruction, delegations),
            timestamp: new Date().toISOString(),
          });
        }
      }

      return;
    }

    if (task.executionMode === "command") {
      const command = formatDelegationInstruction(task, ownerName);
      const cwd = task.cwd || assignee.workspace || "";
      await handleCommandExecutionRequest({
        agent: assignee,
        command,
        cwd,
        source: "delegation",
        task,
        ownerName,
      });
    }
  }

  async function handleCreateDelegation() {
    if (
      !selectedAgent ||
      !delegationDraft.title.trim() ||
      !delegationDraft.assigneeId
    ) {
      return;
    }

    const nextTask = normalizeDelegationTask({
      id: `delegation-${Date.now().toString(36)}`,
      title: delegationDraft.title.trim(),
      fromAgentId: selectedAgent.id,
      assigneeId: delegationDraft.assigneeId,
      status: "queued",
      priority: delegationDraft.priority,
      notes: delegationDraft.notes.trim(),
      executionMode: delegationDraft.executionMode,
      payload: delegationDraft.payload.trim(),
      cwd: delegationDraft.cwd.trim(),
      channelId:
        workspaceView === "channels" ? (selectedChannel?.id ?? null) : null,
      updatedAt: new Date().toISOString(),
    });

    setDelegations((current) => [nextTask, ...current]);
    if (nextTask.channelId) {
      updateChannel(nextTask.channelId, (current) => ({
        ...current,
        linkedDelegationIds: uniqueStrings([
          nextTask.id,
          ...current.linkedDelegationIds,
        ]),
        updatedAt: new Date().toISOString(),
      }));
    }
    setDelegationDraft({
      title: "",
      assigneeId: selectedAgent.id,
      priority: "medium",
      notes: "",
      executionMode: "thread",
      payload: "",
      cwd: resolveWorkspacePath(selectedAgent.workspace),
      autoDispatch: false,
    });
    setWorkspaceView("delegations");
    setIsDelegationOpen(false);

    if (delegationDraft.autoDispatch) {
      await dispatchDelegationTask(nextTask);
    }
  }

  function handleCreateChannel() {
    const title = channelDraft.title.trim();
    const objective = channelDraft.objective.trim();
    const leadId =
      channelDraft.leadAgentId || selectedAgent?.id || allAgents[0]?.id || "";
    const members = uniqueStrings([
      leadId,
      ...channelDraft.memberAgentIds,
    ]).filter(Boolean);

    if (!title || !objective || !leadId || members.length === 0) {
      return;
    }

    const nextChannel: CollaborationChannel = {
      id: `channel-${Date.now().toString(36)}`,
      title,
      objective,
      leadAgentId: leadId,
      memberAgentIds: members,
      memberTargets: normalizeChannelTargets(
        channelDraft.memberTargets,
        members,
      ),
      status: "active",
      linkedDelegationIds: [],
      lastSummary: "Channel created and ready for collaboration.",
      updatedAt: new Date().toISOString(),
    };

    setChannels((current) => [nextChannel, ...current]);
    setChannelMessagesById((current) => ({
      ...current,
      [nextChannel.id]: [
        {
          id: `${nextChannel.id}-system`,
          channelId: nextChannel.id,
          sender: "Workspace",
          senderId: null,
          role: "system",
          kind: "system",
          content: `Channel created for ${title}. Use this room to keep delegations and agent discussion around one shared task.`,
          timestamp: nextChannel.updatedAt,
        },
      ],
    }));
    setSelectedChannelId(nextChannel.id);
    setWorkspaceView("channels");
    setChannelDraft({
      title: "",
      objective: "",
      leadAgentId:
        selectedAgent?.id || allAgents[0]?.id || DEFAULT_CHANNEL_LEAD_AGENT_ID,
      memberAgentIds: selectedAgent
        ? [selectedAgent.id]
        : [DEFAULT_CHANNEL_LEAD_AGENT_ID, "builder", "researcher"],
      memberTargets: {},
    });
    setIsCreateChannelOpen(false);
  }

  async function handleSendChannelMessage(
    event: React.FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (
      !selectedChannel ||
      (!channelComposer.trim() && channelDraftAttachments.length === 0)
    ) {
      return;
    }

    const prompt = channelComposer.trim();
    const attachmentIds = rememberAttachments(channelDraftAttachments);
    const expandedPrompt = mergePromptWithAttachments(
      prompt,
      channelDraftAttachments,
    );
    const visiblePrompt =
      prompt ||
      `Shared ${channelDraftAttachments.length} attachment${channelDraftAttachments.length === 1 ? "" : "s"}.`;
    setChannelComposer("");
    setChannelDraftAttachments([]);
    setChannelAttachmentError(null);

    await handleChannelCollaboration(selectedChannel, visiblePrompt, {
      expandedPrompt,
      attachmentIds,
    });
  }

  async function handleRoutedChannelRequest(input: {
    agent: WorkspaceAgent;
    prompt: string;
    decision: RouterDecision;
    userMessageId?: string;
  }) {
    const startedAt = new Date().toISOString();
    const leadAgent =
      allAgents.find((agent) => agent.id === input.decision.leadAgentId) ??
      input.agent;
    const collaboratorAgents = input.decision.collaboratorAgentIds
      .map((agentId) => allAgents.find((agent) => agent.id === agentId))
      .filter(Boolean) as WorkspaceAgent[];
    const members = uniqueStrings(
      [leadAgent, ...collaboratorAgents].map((member) => member.id),
    )
      .map((agentId) => allAgents.find((agent) => agent.id === agentId))
      .filter(Boolean) as WorkspaceAgent[];
    const memberIds = uniqueStrings(members.map((member) => member.id));
    const collaboratorBriefsByAgentId = Object.fromEntries(
      input.decision.promptExpansion.collaboratorBriefs.map((brief) => [
        brief.agentId,
        brief.instruction,
      ]),
    ) as Record<string, string>;
    const channel: CollaborationChannel = normalizeChannel({
      id: `channel-${Date.now().toString(36)}`,
      title: input.decision.promptExpansion.channelTitle,
      objective: input.prompt,
      leadAgentId: leadAgent.id,
      memberAgentIds: memberIds,
      memberTargets: Object.fromEntries(
        members.map((member) => [
          member.id,
          member.id === leadAgent.id
            ? input.decision.promptExpansion.leadInstruction
            : collaboratorBriefsByAgentId[member.id] || member.objective,
        ]),
      ),
      status: "active",
      linkedDelegationIds: [],
      lastSummary: "",
      updatedAt: startedAt,
    });

    setChannels((current) => [channel, ...current]);
    setSelectedChannelId(channel.id);
    setLatestChannelDecisionById((current) => ({
      ...current,
      [channel.id]: input.decision,
    }));
    if (input.userMessageId) {
      updateThreadRouteTurnChannelId(input.agent.id, input.userMessageId, channel.id);
    }

    const collaboration = await handleChannelCollaboration(
      channel,
      input.prompt,
      {
        expandedPrompt: input.prompt,
        attachmentIds: [],
      },
    );
    const assignedMembers = members.filter(
      (member) => member.id !== leadAgent.id,
    );
    const summary = [
      `I opened ${formatChannelHandle(channel.title)} as the working room for this request.`,
      assignedMembers.length > 0
        ? `I assigned ${assignedMembers.map((member) => `@${slugifyLabel(member.name)}`).join(", ")} to focused slices and I’m reviewing the handoffs here.`
        : "I kept the work in my own lane for now and I’ll expand the room if the task grows.",
      collaboration?.finalSummary ||
        "The room is live now. I’ll keep checking specialist updates and bring the final readout back here.",
    ]
      .filter(Boolean)
      .join("\n\n");

    return {
      channel,
      summary,
      collaboratorCount: assignedMembers.length,
    };
  }

  function cycleDelegationStatus(taskId: string) {
    setDelegations((current) =>
      current.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        const nextStatus: DelegationStatus =
          task.status === "queued"
            ? "active"
            : task.status === "active"
              ? "done"
              : task.status === "blocked"
                ? "active"
                : "done";

        return {
          ...task,
          status: nextStatus,
          updatedAt: new Date().toISOString(),
        };
      }),
    );
  }

  async function handleSendMessage(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !selectedAgent ||
      (!chatDraft.trim() && chatDraftAttachments.length === 0) ||
      isReplying
    ) {
      return;
    }

    const nowIso = new Date().toISOString();
    const prompt = chatDraft.trim();
    const attachmentIds = rememberAttachments(chatDraftAttachments);
    const expandedPrompt = mergePromptWithAttachments(
      prompt,
      chatDraftAttachments,
    );
    const visiblePrompt =
      prompt ||
      `Shared ${chatDraftAttachments.length} attachment${chatDraftAttachments.length === 1 ? "" : "s"}.`;
    const selectedAgentSnapshot = selectedAgent;
    const capabilityGap = detectCapabilityGap(expandedPrompt, allAgents);
    const previousThread = messagesByAgent[selectedAgentSnapshot.id] ?? [];
    const userMessage: ChatMessage = {
      id: `${selectedAgentSnapshot.id}-user-${Date.now().toString(36)}`,
      agentId: selectedAgentSnapshot.id,
      role: "user",
      sender: "You",
      content: visiblePrompt,
      contextText: expandedPrompt,
      attachmentIds,
      timestamp: nowIso,
    };

    setChatError(null);
    setChatDraft("");
    setChatDraftAttachments([]);
    setChatAttachmentError(null);

    setMessagesByAgent((current) => ({
      ...current,
      [selectedAgentSnapshot.id]: [
        ...(current[selectedAgentSnapshot.id] ?? []),
        userMessage,
      ],
    }));
    void persistPhaseTwoMessage(
      {
        agentId: userMessage.agentId,
        role: userMessage.role,
        content: userMessage.contextText || userMessage.content,
        sender: userMessage.sender,
      },
      previousThread.length + 1,
      { source: "user_turn" },
    );

    const thinkingActivityId = `${selectedAgentSnapshot.id}-thinking-${Date.now().toString(36)}`;
    pushLiveActivity({
      id: thinkingActivityId,
      agentId: selectedAgentSnapshot.id,
      kind: "thinking",
      label: "Thinking",
      detail: prompt || "Reviewing attached context",
      status: "running",
      timestamp: nowIso,
    });

    if (selectedAgentSnapshot.source === "custom") {
      updateCustomAgent(selectedAgentSnapshot.id, (agent) => ({
        ...agent,
        status: "active",
        currentActivity: `Reviewing: ${(prompt || "attached context").slice(0, 48)}${(prompt || "attached context").length > 48 ? "..." : ""}`,
        lastSeen: nowIso,
      }));
    }

    const routerResult = routeUserRequest({
      prompt: expandedPrompt,
      agents: allAgents,
      preferredAgentId: selectedAgentSnapshot.id,
      defaultLeadAgentId: GALAXY_AGENT_ID,
    });
    const preloadedMemoryContext = await loadPhaseTwoMemoryContext(
      selectedAgentSnapshot.id,
    );
    const dispatcherDecision = buildDispatcherDecision({
      prompt: expandedPrompt,
      routerDecision: routerResult.decision,
    });
    addDispatcherDecision(dispatcherDecision);
    setContextPackage(
      selectedAgentSnapshot.id,
      buildContextPackage({
        agentId: selectedAgentSnapshot.id,
        prompt: expandedPrompt,
        memory: preloadedMemoryContext.bundle,
        channel: selectedChannel,
        delegations: delegations
          .filter(
            (task) =>
              task.assigneeId === selectedAgentSnapshot.id ||
              task.fromAgentId === selectedAgentSnapshot.id,
          )
          .slice(0, 5)
          .map((task) => ({
            id: task.id,
            title: task.title,
            assigneeId: task.assigneeId,
            status: task.status,
          })),
        globalPreferences: [
          digitalTwinProfile.preferredLanguage,
          digitalTwinProfile.codingStyle,
          ...digitalTwinProfile.techStack.slice(0, 4),
        ].filter(Boolean),
      }),
    );

    const leadAgentForTree =
      allAgents.find((agent) => agent.id === routerResult.decision.leadAgentId) ??
      selectedAgentSnapshot;
    const taskTree = createTaskTreeFromDecision({
      prompt: expandedPrompt,
      dispatcherDecision,
      leadAgent: leadAgentForTree,
      collaboratorAgents: routerResult.decision.collaboratorAgentIds
        .map((agentId) => allAgents.find((agent) => agent.id === agentId))
        .filter(Boolean) as WorkspaceAgent[],
      channelId: selectedChannel?.id ?? null,
    });
    upsertTaskTree(taskTree);
    setSelectedTaskTreeId(taskTree.id);

    if (dispatcherDecision.requiresPlanReview) {
      const review = buildPlanReviewRequest({
        dispatcherDecision,
        prompt: expandedPrompt,
        taskTree,
      });
      upsertPlanReview(review);
      setActivePlanReviewId(review.id);
    }

    if (
      selectedAgentSnapshot.id === GALAXY_AGENT_ID &&
      capabilityGap &&
      capabilityGap.confidence >= 0.5
    ) {
      setPendingBlueprint(
        generateAgentBlueprint(capabilityGap, digitalTwinProfile),
      );
      setIsAgentCreatorOpen(true);
    }
    appendThreadRouteTurn({
      agentId: selectedAgentSnapshot.id,
      userMessageId: userMessage.id,
      request: expandedPrompt,
      decision: routerResult.decision,
    });

    const useLiveRuntime =
      hasAgentRuntime && selectedAgentSnapshot.source === "custom";
    const messageHasImageInput = hasImageAttachments(chatDraftAttachments);
    const shouldOpenRoutedChannel = routerResult.decision.lane === "channel";
    const shouldOpenBrowserSession =
      shouldUseInteractiveBrowser(
        selectedAgentSnapshot,
        expandedPrompt,
        Boolean(runtimeHealth.providers?.browserUse),
      ) && !shouldOpenRoutedChannel;
    const finishReplyingForAgent = () => {
      setIsReplying(false);
      setReplyingAgentId((current) =>
        current === selectedAgentSnapshot.id ? null : current,
      );
    };

    if (shouldOpenRoutedChannel) {
      setIsReplying(true);
      setReplyingAgentId(selectedAgentSnapshot.id);
      updateTaskTree(taskTree.id, (current) => ({
        ...current,
        status: "running",
        updatedAt: new Date().toISOString(),
        nodes: current.nodes.map((node) =>
          node.kind === "analysis"
            ? { ...node, status: "completed", updatedAt: new Date().toISOString() }
            : node.kind === "execution" || node.kind === "research"
              ? { ...node, status: "running", updatedAt: new Date().toISOString() }
              : node,
        ),
      }));

      updateLiveActivity(thinkingActivityId, (entry) => ({
        ...entry,
        status: "completed",
        detail: "Opening a routed room and dispatching specialist work.",
        timestamp: new Date().toISOString(),
      }));

      const orchestration = await handleRoutedChannelRequest({
        agent: selectedAgentSnapshot,
        prompt: expandedPrompt,
        decision: routerResult.decision,
        userMessageId: userMessage.id,
      });

      await streamAssistantReply({
        agent: selectedAgentSnapshot,
        text: orchestration.summary,
        previousThread,
      });

      if (selectedAgentSnapshot.source === "custom") {
        updateCustomAgent(selectedAgentSnapshot.id, (agent) => ({
          ...agent,
          status: "idle",
          currentActivity:
            orchestration.collaboratorCount > 0
              ? `Reviewing ${orchestration.collaboratorCount} delegated slice${orchestration.collaboratorCount === 1 ? "" : "s"}`
              : "Ready in the thread workspace",
          lastSeen: new Date().toISOString(),
        }));
      }

      updateTaskTree(taskTree.id, (current) => ({
        ...current,
        status: "completed",
        finalSummary: orchestration.summary,
        updatedAt: new Date().toISOString(),
        nodes: current.nodes.map((node) => ({
          ...node,
          status:
            node.kind === "analysis" ||
            node.kind === "execution" ||
            node.kind === "research" ||
            node.kind === "synthesis" ||
            node.kind === "review"
              ? "completed"
              : node.status,
          updatedAt: new Date().toISOString(),
        })),
      }));

      finishReplyingForAgent();
      return;
    }

    const browserContextMessages: RuntimeChatMessage[] = [];
    let hasLiveResearchContext = false;
    if (shouldOpenBrowserSession) {
      setIsReplying(true);
      setReplyingAgentId(selectedAgentSnapshot.id);

      updateLiveActivity(thinkingActivityId, (entry) => ({
        ...entry,
        status: "running",
        detail: "Launching a browser lane, then continuing the reply in chat.",
        timestamp: new Date().toISOString(),
      }));

      const browserLaunch = await launchBrowserSessionForAgent({
        agent: selectedAgentSnapshot,
        prompt: expandedPrompt,
        focusDrawer: false,
      });

      browserContextMessages.push(
        buildBrowserSessionContextMessage(browserLaunch),
      );
      const liveResearchContext = await collectLiveWebResearch({
        agent: selectedAgentSnapshot,
        prompt: expandedPrompt,
        activityId: thinkingActivityId,
      });
      if (liveResearchContext) {
        hasLiveResearchContext = true;
        browserContextMessages.push(liveResearchContext);
      }

      if (selectedAgentSnapshot.source === "custom") {
        updateCustomAgent(selectedAgentSnapshot.id, (agent) => ({
          ...agent,
          status: browserLaunch.ok ? "active" : "active",
          currentActivity: browserLaunch.ok
            ? "Browsing in the background and drafting a reply"
            : "Browser launch failed, continuing in chat",
          lastSeen: new Date().toISOString(),
        }));
      }

      updateLiveActivity(thinkingActivityId, (entry) => ({
        ...entry,
        status: "completed",
        detail: browserLaunch.ok
          ? "Browser lane is live. Drafting the answer in chat now."
          : "Browser lane failed, but the agent is still replying in chat.",
        timestamp: new Date().toISOString(),
      }));
    }

    if (useLiveRuntime) {
      setIsReplying(true);
      setReplyingAgentId(selectedAgentSnapshot.id);

      const runtimeChatAgent = withVisionRuntimeAgent(selectedAgentSnapshot, {
        hasImageInput: messageHasImageInput,
        githubModelsReady: Boolean(runtimeHealth.providers?.githubModels),
      });
      const memoryContext = preloadedMemoryContext;
      const executionContextMessages: ChatMessage[] = [];
      const executionSteps: ExecutionStepResult[] = [];
      let finalReasoning = "";
      let loopBlocked = false;
      const seenCommands = new Set<string>();

      if (!messageHasImageInput) {
        for (let stepIndex = 0; stepIndex < 4; stepIndex += 1) {
          const executionPlan = await planAgentExecution(
            selectedAgentSnapshot,
            expandedPrompt,
            [...previousThread, userMessage, ...executionContextMessages],
          );

          if (!(executionPlan?.mode === "command" && executionPlan.command)) {
            finalReasoning = executionPlan?.reasoning || finalReasoning;
            updateLiveActivity(thinkingActivityId, (entry) => ({
              ...entry,
              status: "completed",
              detail:
                executionPlan?.reasoning || "Continuing with a direct reply.",
              timestamp: new Date().toISOString(),
            }));
            break;
          }

          const commandSignature = `${executionPlan.cwd || selectedAgentSnapshot.workspace || ""}::${executionPlan.command}`;
          if (seenCommands.has(commandSignature)) {
            finalReasoning =
              "Execution stopped because the same sandbox action was suggested again.";
            const breaker = detectCircuitBreakerEvent({
              agentId: selectedAgentSnapshot.id,
              handoffCount: 0,
              repeatedCommandCount: 2,
              failureCount: 0,
            });
            if (breaker) {
              addCircuitBreakerEvent(breaker);
            }
            updateTaskTree(taskTree.id, (current) => ({
              ...current,
              status: "blocked",
              updatedAt: new Date().toISOString(),
            }));
            updateLiveActivity(thinkingActivityId, (entry) => ({
              ...entry,
              status: "completed",
              detail: finalReasoning,
              timestamp: new Date().toISOString(),
            }));
            break;
          }

          seenCommands.add(commandSignature);
          updateLiveActivity(thinkingActivityId, (entry) => ({
            ...entry,
            status: "running",
            detail: `Working through sandbox step ${stepIndex + 1}: ${executionPlan.command}`,
            timestamp: new Date().toISOString(),
          }));

          const executionResult = await handleCommandExecutionRequest({
            agent: selectedAgentSnapshot,
            command: executionPlan.command,
            cwd: executionPlan.cwd || selectedAgentSnapshot.workspace || "",
            source: "agent",
          });

          if (!executionResult) {
            loopBlocked = true;
            finalReasoning =
              "Execution could not continue because the next sandbox action was blocked.";
            break;
          }

          setRuntimeHealth((current) => ({
            ...current,
            ok: true,
            runtime: current.runtime || "control-room-local-runtime",
            providers: current.providers,
            error: undefined,
          }));

          executionSteps.push({
            command: executionPlan.command,
            cwd: executionPlan.cwd || selectedAgentSnapshot.workspace || "",
            result: executionResult,
          });
          updateThoughtSnapshot({
            agentId: selectedAgentSnapshot.id,
            thought:
              latestThoughtByAgentId[selectedAgentSnapshot.id]?.thought ||
              finalReasoning ||
              "Prepared a sandbox step.",
            command: executionPlan.command,
            observation:
              executionResult.stdout?.slice(0, 240) ||
              executionResult.stderr?.slice(0, 240) ||
              executionResult.error ||
              `Exit code ${executionResult.exitCode ?? "unknown"}`,
          });

          executionContextMessages.push({
            id: `${selectedAgentSnapshot.id}-execution-step-${stepIndex}-${Date.now().toString(36)}`,
            agentId: selectedAgentSnapshot.id,
            role: "system",
            sender: "Runtime",
            content: [
              `Completed sandbox step ${stepIndex + 1}.`,
              `Command: ${executionPlan.command}`,
              executionResult.cwd ? `Cwd: ${executionResult.cwd}` : "",
              typeof executionResult.exitCode === "number"
                ? `Exit code: ${executionResult.exitCode}`
                : "",
              executionResult.timedOut ? "The command timed out." : "",
              executionResult.stdout
                ? `stdout:\n${executionResult.stdout}`
                : "",
              executionResult.stderr
                ? `stderr:\n${executionResult.stderr}`
                : "",
              executionResult.error ? `error: ${executionResult.error}` : "",
              executionResult.artifacts?.length
                ? `artifacts:\n${executionResult.artifacts
                    .map(
                      (artifact) =>
                        artifact.path || artifact.url || artifact.name,
                    )
                    .filter(Boolean)
                    .join("\n")}`
                : "",
            ]
              .filter(Boolean)
              .join("\n\n"),
            timestamp: new Date().toISOString(),
          });

          if (!executionResult.ok) {
            finalReasoning = "Execution stopped because a sandbox step failed.";
            break;
          }
        }
      }

      if (loopBlocked) {
        const breaker = detectCircuitBreakerEvent({
          agentId: selectedAgentSnapshot.id,
          handoffCount: 0,
          repeatedCommandCount: 1,
          failureCount: 2,
        });
        if (breaker) {
          addCircuitBreakerEvent(breaker);
        }
        updateTaskTree(taskTree.id, (current) => ({
          ...current,
          status: "blocked",
          updatedAt: new Date().toISOString(),
        }));
        await streamAssistantReply({
          agent: selectedAgentSnapshot,
          text: "I couldn’t finish the full sandbox flow because the next step was blocked before execution. Check Activity for the command details.",
          previousThread,
        });

        finishReplyingForAgent();
        return;
      }

      if (executionSteps.length > 0) {
        updateTaskTree(taskTree.id, (current) => ({
          ...current,
          status: "running",
          updatedAt: new Date().toISOString(),
          nodes: current.nodes.map((node) =>
            node.kind === "analysis"
              ? { ...node, status: "completed", updatedAt: new Date().toISOString() }
              : node.kind === "execution" || node.kind === "synthesis"
                ? { ...node, status: "completed", updatedAt: new Date().toISOString() }
                : node.kind === "review"
                  ? { ...node, status: "running", updatedAt: new Date().toISOString() }
                  : node,
          ),
        }));
        const assistantText = await summarizeAgentExecutionSequence({
          agent: selectedAgentSnapshot,
          previousThread,
          userPrompt: expandedPrompt,
          steps: executionSteps,
          browserContextMessages,
          finalReasoning,
        });
        const critiqued = await runCritiquedText({
          agent: selectedAgentSnapshot,
          prompt: expandedPrompt,
          text: assistantText,
          taskTreeId: taskTree.id,
          contextMessages: [
            ...memoryContext.runtimeMessages,
            ...toRuntimeConversation(
              [...previousThread, userMessage, ...executionContextMessages],
              attachmentLibrary,
            ),
            ...browserContextMessages,
          ],
        });

        await streamAssistantReply({
          agent: selectedAgentSnapshot,
          text: critiqued.text,
          previousThread,
        });

        updateTaskTree(taskTree.id, (current) => ({
          ...current,
          status: "completed",
          finalSummary: critiqued.text,
          updatedAt: new Date().toISOString(),
          nodes: current.nodes.map((node) =>
            node.kind === "review"
              ? { ...node, status: "completed", updatedAt: new Date().toISOString() }
              : node,
          ),
        }));

        finishReplyingForAgent();
        return;
      }

      const result = await sendAgentRuntimeChat({
        agent: withLiveWebContextPrompt(runtimeChatAgent, {
          hasBrowserLane: browserContextMessages.length > 0,
          hasLiveResearch: hasLiveResearchContext,
        }),
        messages: [
          ...memoryContext.runtimeMessages,
          ...toRuntimeConversation(
            [...previousThread, userMessage],
            attachmentLibrary,
          ),
          ...browserContextMessages,
        ],
      });

      if (!result.ok || !result.text) {
        const errorMessage =
          result.error || "The local runtime could not produce a response.";
        updateTaskTree(taskTree.id, (current) => ({
          ...current,
          status: "failed",
          updatedAt: new Date().toISOString(),
        }));

        setChatError(errorMessage);
        setRuntimeHealth((current) => ({
          ...current,
          ok: false,
          error: errorMessage,
        }));
        setMessagesByAgent((current) => ({
          ...current,
          [selectedAgentSnapshot.id]: [
            ...(current[selectedAgentSnapshot.id] ?? []),
            {
              id: `${selectedAgentSnapshot.id}-system-${Date.now().toString(36)}`,
              agentId: selectedAgentSnapshot.id,
              role: "system",
              sender: "Runtime",
              content: `Live runtime error: ${errorMessage}`,
              timestamp: new Date().toISOString(),
            },
          ],
        }));

        if (selectedAgentSnapshot.source === "custom") {
          updateCustomAgent(selectedAgentSnapshot.id, (agent) => ({
            ...agent,
            status: "error",
            currentActivity: "Runtime error in thread workspace",
            lastSeen: new Date().toISOString(),
          }));
        }

        finishReplyingForAgent();
        return;
      }

      setRuntimeHealth((current) => ({
        ...current,
        ok: true,
        runtime: current.runtime || "control-room-local-runtime",
        providers: current.providers,
        error: undefined,
      }));
      const critiqued = await runCritiquedText({
        agent: selectedAgentSnapshot,
        prompt: expandedPrompt,
        text: result.text,
        taskTreeId: taskTree.id,
        contextMessages: [
          ...memoryContext.runtimeMessages,
          ...toRuntimeConversation(
            [...previousThread, userMessage],
            attachmentLibrary,
          ),
          ...browserContextMessages,
        ],
      });
      await streamAssistantReply({
        agent: selectedAgentSnapshot,
        text: critiqued.text,
        previousThread,
      });

      updateTaskTree(taskTree.id, (current) => ({
        ...current,
        status: "completed",
        finalSummary: critiqued.text,
        updatedAt: new Date().toISOString(),
        nodes: current.nodes.map((node) => ({
          ...node,
          status: node.kind === "analysis" ? "completed" : "completed",
          updatedAt: new Date().toISOString(),
        })),
      }));

      if (selectedAgentSnapshot.source === "custom") {
        updateCustomAgent(selectedAgentSnapshot.id, (agent) => ({
          ...agent,
          status: "idle",
          currentActivity: "Ready in the thread workspace",
          lastSeen: new Date().toISOString(),
        }));
      }

      finishReplyingForAgent();
      return;
    }

    updateLiveActivity(thinkingActivityId, (entry) => ({
      ...entry,
      status: "completed",
      detail: "Continuing with a local prototype reply.",
      timestamp: new Date().toISOString(),
    }));

    await streamAssistantReply({
      agent: selectedAgentSnapshot,
      text: generateAgentReply(
        selectedAgentSnapshot,
        expandedPrompt,
        delegations,
      ),
      previousThread,
    });
    updateTaskTree(taskTree.id, (current) => ({
      ...current,
      status: "completed",
      updatedAt: new Date().toISOString(),
      finalSummary: "Completed locally without runtime.",
      nodes: current.nodes.map((node) => ({
        ...node,
        status: "completed",
        updatedAt: new Date().toISOString(),
      })),
    }));
  }

  async function handleRunCodeBlockInSandbox(input: {
    agent: WorkspaceAgent;
    code: string;
    language: string;
  }) {
    if (!input.agent.permissions.terminal) {
      setChatError("This agent is not terminal-enabled for sandbox execution.");
      return;
    }

    const language = input.language.toLowerCase();
    const command =
      language === "python" || language === "py"
        ? `python3 - <<'PY'\n${input.code}\nPY`
        : language === "javascript" || language === "js" || language === "node"
          ? `node - <<'JS'\n${input.code}\nJS`
          : language === "typescript" || language === "ts"
            ? `npx tsx - <<'TS'\n${input.code}\nTS`
            : input.code;

    await handleCommandExecutionRequest({
      agent: input.agent,
      command,
      cwd: input.agent.workspace || DEFAULT_AGENT_WORKSPACE,
      source: "agent",
    });

    setActivityDrawerTab("activity");
    setIsActivityDrawerOpen(true);
  }

  async function handleRunCommand(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (
      !selectedAgent ||
      selectedAgent.source !== "custom" ||
      !commandDraft.trim() ||
      isExecutingCommand
    ) {
      return;
    }

    const selectedAgentSnapshot = selectedAgent;
    const command = commandDraft.trim();
    const cwd = commandCwdDraft.trim() || selectedAgentSnapshot.workspace || "";
    await handleCommandExecutionRequest({
      agent: selectedAgentSnapshot,
      command,
      cwd,
      source: "runner",
    });
  }

  async function handleRetryRun(run: CommandRun) {
    const agent = allAgents.find((candidate) => candidate.id === run.agentId);

    if (hasAgentRuntime && run.runtimeRunId) {
      setIsMutatingRunId(run.id);
      const result = await retryRun(run.runtimeRunId);
      setIsMutatingRunId(null);

      if (!result.ok) {
        setRuntimeRunsError(result.error || "Failed to retry run.");
        return;
      }

      if (result.run) {
        setRuntimeRuns((current) => [
          mapRuntimeRunRecord(result.run as RuntimeCommandRunRecord),
          ...current,
        ]);
      }

      await refreshRuntimeRuns();
      return;
    }

    if (!agent || agent.source !== "custom") {
      setRuntimeRunsError(
        "This run cannot be retried because its agent is no longer available.",
      );
      return;
    }

    setSelectedAgentId(agent.id);
    setWorkspaceView("chat");
    await handleCommandExecutionRequest({
      agent,
      command: run.command,
      cwd: run.cwd,
      source: "runner",
    });
    await refreshRuntimeRuns();
  }

  async function handleResumeRun(run: CommandRun) {
    if (!run.runtimeRunId) {
      setRuntimeRunsError("This run does not have a resumable runtime ID.");
      return;
    }

    setIsMutatingRunId(run.id);
    const result = await resumeRun(run.runtimeRunId);
    setIsMutatingRunId(null);

    if (!result.ok) {
      setRuntimeRunsError(result.error || "Failed to resume run.");
      return;
    }

    if (result.run) {
      setRuntimeRuns((current) =>
        current.map((entry) =>
          entry.runtimeRunId === run.runtimeRunId
            ? mapRuntimeRunRecord(result.run as RuntimeCommandRunRecord)
            : entry,
        ),
      );
    }

    await refreshRuntimeRuns();
  }

  async function handleCancelRun(run: CommandRun) {
    if (!run.runtimeRunId) {
      setRuntimeRunsError("This run does not have a cancelable runtime ID.");
      return;
    }

    setIsMutatingRunId(run.id);
    const result = await cancelAgentRuntimeRun(run.runtimeRunId);
    setIsMutatingRunId(null);

    if (!result.ok) {
      setRuntimeRunsError(result.error || "Failed to cancel the runtime run.");
      return;
    }

    setRuntimeRuns((current) =>
      current.map((entry) =>
        entry.runtimeRunId === run.runtimeRunId || entry.id === run.runtimeRunId
          ? mapRuntimeRunRecord(result.run as RuntimeCommandRunRecord)
          : entry,
      ),
    );
    setCommandRuns((current) =>
      current.map((entry) =>
        entry.runtimeRunId === run.runtimeRunId
          ? {
              ...entry,
              status: "canceled",
              phase: "canceled",
              error: "Canceled by user.",
            }
          : entry,
      ),
    );
    setRuntimeRunsError(null);
  }

  const currentAgentDelegations = useMemo(() => {
    if (!selectedAgent) {
      return [];
    }

    return delegations.filter(
      (task) =>
        task.assigneeId === selectedAgent.id ||
        task.fromAgentId === selectedAgent.id,
    );
  }, [delegations, selectedAgent]);

  const currentAgentRuns = useMemo(() => {
    if (!selectedAgent) {
      return [];
    }

    const mergedRuns = new Map<string, CommandRun>();
    [...runtimeRuns, ...commandRuns].forEach((run) => {
      const key = run.runtimeRunId || run.id;
      const existing = mergedRuns.get(key);
      if (!existing || existing.createdAt.localeCompare(run.createdAt) < 0) {
        mergedRuns.set(key, run);
      }
    });

    return [...mergedRuns.values()]
      .filter((run) => run.agentId === selectedAgent.id)
      .slice(0, 6);
  }, [commandRuns, runtimeRuns, selectedAgent]);
  const currentAgentArtifacts = useMemo(() => {
    const artifactMap = new Map<string, RuntimeArtifact>();

    currentAgentRuns.forEach((run) => {
      (run.artifacts ?? []).forEach((artifact) => {
        const key =
          artifact.path || artifact.url || `${artifact.name}-${artifact.type}`;
        if (!artifactMap.has(key)) {
          artifactMap.set(key, artifact);
        }
      });
    });

    return [...artifactMap.values()];
  }, [currentAgentRuns]);
  const selectedFilePreviewArtifact =
    currentAgentArtifacts.find(
      (artifact) => artifact.path === selectedFilePreviewPath,
    ) ??
    currentAgentArtifacts[0] ??
    null;
  const selectedFilePreviewUrl = selectedFilePreviewArtifact?.path
    ? getRuntimeFileViewUrl(selectedFilePreviewArtifact.path)
    : "";
  const latestAgentRun = currentAgentRuns[0] ?? null;
  const currentLiveActivities = useMemo(() => {
    if (!selectedAgent) {
      return [];
    }

    return liveActivityEntries
      .filter((entry) => entry.agentId === selectedAgent.id)
      .slice(0, 8);
  }, [liveActivityEntries, selectedAgent]);
  const activeActionChips = currentLiveActivities
    .filter((entry) => entry.status === "running")
    .slice(0, 3);
  const workspaceRuns = useMemo(() => {
    const mergedRuns = new Map<string, CommandRun>();
    [...runtimeRuns, ...commandRuns].forEach((run) => {
      const key = run.runtimeRunId || run.id;
      const existing = mergedRuns.get(key);
      if (!existing || existing.createdAt.localeCompare(run.createdAt) < 0) {
        mergedRuns.set(key, run);
      }
    });

    return [...mergedRuns.values()];
  }, [commandRuns, runtimeRuns]);
  const selectedActivityRun =
    workspaceRuns.find((run) => run.id === selectedActivityRunId) ??
    workspaceRuns[0] ??
    null;
  const selectedTaskTree =
    taskTrees.find((taskTree) => taskTree.id === selectedTaskTreeId) ??
    taskTrees.find((taskTree) => taskTree.rootAgentId === selectedAgent?.id) ??
    taskTrees[0] ??
    null;
  const activePlanReview =
    planReviews.find((review) => review.id === activePlanReviewId) ??
    planReviews.find((review) => review.status === "pending") ??
    null;
  const selectedKnowledgeGraph = selectedAgent
    ? knowledgeGraphByAgent[selectedAgent.id] ?? null
    : null;
  const selectedVerifierReviews = selectedAgent
    ? verifierReviews.filter((review) => review.agentId === selectedAgent.id)
    : verifierReviews;
  const latestDispatcherDecision = dispatcherDecisions[0] ?? null;

  const pendingApprovalAgent = useMemo(() => {
    if (!pendingCommandApproval) {
      return null;
    }

    return (
      allAgents.find((agent) => agent.id === pendingCommandApproval.agentId) ??
      null
    );
  }, [allAgents, pendingCommandApproval]);

  const runtimeStatusLabel = !hasAgentRuntime
    ? "Runtime Off"
    : runtimeHealth.ok
      ? "Runtime Online"
      : "Runtime Offline";
  const githubDeviceFlow = runtimeHealth.auth?.githubDeviceFlow;
  const githubModelsReady = Boolean(runtimeHealth.providers?.githubModels);
  const copilotOAuthConfigured = Boolean(githubDeviceFlow?.configured);
  const copilotAuthenticated = Boolean(githubDeviceFlow?.authenticated);
  const copilotTokenSource = githubDeviceFlow?.tokenSource || "none";
  const customAgentCount = allAgents.filter(
    (agent) => agent.source === "custom",
  ).length;
  const channelCount = channels.length;
  const selectedChannelLead = selectedChannel
    ? (allAgents.find((agent) => agent.id === selectedChannel.leadAgentId) ??
      null)
    : null;
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
  const topPanelTitle =
    workspaceView === "channels"
      ? selectedChannel?.title || "Channels"
      : workspaceView === "council"
        ? selectedCouncilSession?.question || "Council"
        : workspaceView === "activity"
          ? "Command Deck"
          : workspaceView === "delegations"
            ? "Delegations"
            : workspaceView === "accounts"
              ? "Accounts"
              : workspaceView === "observability"
                ? "Observatory"
                : selectedAgent?.name || "Agent Workspace";
  const topPanelSubtitle =
    workspaceView === "channels"
      ? selectedChannel
        ? `${selectedChannelMembers.length} members · lead @${slugifyLabel(selectedChannelLead?.name || "agent")}`
        : "Shared task rooms for multi-agent collaboration."
      : workspaceView === "council"
        ? selectedCouncilSession
          ? `${selectedCouncilSession.participants.length} council agents · ${selectedCouncilSession.messages.length} messages`
          : "Structured multi-agent discussion room."
        : workspaceView === "activity"
          ? "Live runs, feed, and agent state"
          : workspaceView === "delegations"
            ? "Task routing and execution"
            : workspaceView === "accounts"
              ? "Providers and auth surface"
              : workspaceView === "observability"
                ? "Runtime telemetry and health"
        : selectedAgent
          ? `${selectedAgent.provider} · ${selectedAgent.model} · ${selectedAgent.role}`
          : "Choose an agent to inspect runs, tools, and workspace activity.";
  const selectedAgentSubtitle = selectedAgent
    ? `${selectedAgent.provider} · ${selectedAgent.model} · ${selectedAgent.role}`
    : "Choose an agent to inspect runs, tools, and workspace activity.";
  const selectedAgentWorkspaceLabel =
    selectedAgent?.workspace || "No workspace path configured yet.";
  const topPanelMetaLine =
    workspaceView === "channels"
      ? selectedChannel?.objective ||
        "Pick a channel and coordinate agents in one shared room."
      : workspaceView === "council"
        ? "Launch a debate, let agents respond, and keep the discussion visible in one place."
        : workspaceView === "activity"
          ? selectedActivityRun
            ? `${selectedActivityRun.command} · ${formatRelativeTime(selectedActivityRun.createdAt)}`
            : "Inspect the workspace feed, active runs, and the focus agent without leaving the deck."
          : workspaceView === "delegations"
            ? "Coordinate specialist tasks, blockers, and handoffs."
            : workspaceView === "accounts"
              ? "Manage runtime providers, device auth, and linked services."
              : workspaceView === "observability"
                ? "Follow system health, run history, and tool activity across the workspace."
        : selectedAgentWorkspaceLabel;
  const activityDrawerLegacyProps = {
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
    commandError,
  };
  const workspaceInFlightCount = useMemo(
    () => workspaceRuns.filter((run) => runIsInFlight(run.status)).length,
    [workspaceRuns],
  );
  const workspaceAttentionCount = useMemo(
    () => workspaceRuns.filter((run) => runNeedsAttention(run.status)).length,
    [workspaceRuns],
  );
  const workspaceCompletedCount = useMemo(
    () => workspaceRuns.filter((run) => run.status === "completed").length,
    [workspaceRuns],
  );
  const workspaceFinishedCount = useMemo(
    () =>
      workspaceRuns.filter((run) =>
        ["completed", "failed", "blocked", "canceled"].includes(run.status),
      ).length,
    [workspaceRuns],
  );
  const workspaceAverageDuration = useMemo(() => {
    const durations = workspaceRuns
      .map((run) => run.durationMs)
      .filter((value): value is number => typeof value === "number");

    if (durations.length === 0) {
      return null;
    }

    return Math.round(
      durations.reduce((sum, duration) => sum + duration, 0) / durations.length,
    );
  }, [workspaceRuns]);
  const workspaceSuccessRate =
    workspaceFinishedCount > 0
      ? Math.round((workspaceCompletedCount / workspaceFinishedCount) * 100)
      : null;
  const activityMetricCards = useMemo(
    () => [
      {
        label: "Runs Tracked",
        value: workspaceRuns.length.toString(),
        detail:
          workspaceRuns.length > 0
            ? `${workspaceCompletedCount} completed`
            : "No recorded runs yet",
        accent: "text-[#eef6ff]",
        icon: Activity,
        iconClasses:
          "border-[#93c5fd]/18 bg-[linear-gradient(180deg,rgba(59,130,246,0.24),rgba(37,99,235,0.14))] text-[#9dd7ff]",
      },
      {
        label: "Live Right Now",
        value: workspaceInFlightCount.toString(),
        detail:
          workspaceInFlightCount > 0
            ? `${workspaceAttentionCount} need attention`
            : "No active terminal work",
        accent:
          workspaceInFlightCount > 0 ? "text-[#8fd8ff]" : "text-[#dce7f2]",
        icon: Cpu,
        iconClasses:
          "border-[#38bdf8]/18 bg-[linear-gradient(180deg,rgba(14,165,233,0.24),rgba(29,78,216,0.14))] text-[#8fd8ff]",
      },
      {
        label: "Success Rate",
        value:
          workspaceSuccessRate !== null ? `${workspaceSuccessRate}%` : "—",
        detail:
          workspaceFinishedCount > 0
            ? `${workspaceFinishedCount} finished runs`
            : "Waiting for completed history",
        accent:
          workspaceSuccessRate !== null && workspaceSuccessRate >= 80
            ? "text-[#86efac]"
            : "text-[#f9d78d]",
        icon: ShieldCheck,
        iconClasses:
          "border-[#34d399]/18 bg-[linear-gradient(180deg,rgba(16,185,129,0.24),rgba(5,150,105,0.14))] text-[#86efac]",
      },
      {
        label: "Average Duration",
        value: workspaceAverageDuration ? `${workspaceAverageDuration}ms` : "—",
        detail:
          workspaceAverageDuration !== null
            ? "Across captured workspace runs"
            : "No timing data captured yet",
        accent: "text-[#dce7f2]",
        icon: Clock3,
        iconClasses:
          "border-white/10 bg-[linear-gradient(180deg,rgba(148,163,184,0.16),rgba(71,85,105,0.12))] text-[#dce7f2]",
      },
    ],
    [
      workspaceAttentionCount,
      workspaceAverageDuration,
      workspaceCompletedCount,
      workspaceFinishedCount,
      workspaceInFlightCount,
      workspaceRuns.length,
      workspaceSuccessRate,
    ],
  );
  const activityFocusAgent =
    (selectedActivityRun
      ? allAgents.find((agent) => agent.id === selectedActivityRun.agentId)
      : null) ??
    selectedAgent ??
    null;
  const activityFocusRuns = useMemo(
    () =>
      activityFocusAgent
        ? workspaceRuns.filter((run) => run.agentId === activityFocusAgent.id)
        : [],
    [activityFocusAgent, workspaceRuns],
  );
  const activityFocusCapabilityGroups = useMemo(
    () =>
      activityFocusAgent
        ? capabilitySummary(activityFocusAgent.permissions)
        : [],
    [activityFocusAgent],
  );
  const isChannelsWorkspace = workspaceView === "channels";
  const isCouncilWorkspace = workspaceView === "council";
  const channelStatusMeta = selectedChannel
    ? channelMeta[selectedChannel.status]
    : channelMeta.active;
  const builtInToolRows = useMemo(
    () =>
      [
        {
          id: "sandbox",
          label: "Sandbox files & shell",
          description:
            "Read/write files, inspect repos, and run commands in the local workspace sandbox.",
          status: hasAgentRuntime ? "available" : "offline",
        },
        {
          id: "web",
          label: "Web research",
          description:
            "Fetch pages, extract text, make HTTP requests, and launch Browser Use sessions.",
          status: hasAgentRuntime ? "available" : "offline",
        },
        {
          id: "messaging",
          label: "Messaging & inbox",
          description:
            "Use threads, channels, council sessions, and delegated task rooms inside Control Room.",
          status: "available",
        },
        {
          id: "memory",
          label: "Memory & history",
          description:
            "Store thread summaries, notes, knowledge, and file attachments through the runtime memory layer.",
          status: hasAgentRuntime ? "available" : "offline",
        },
        {
          id: "scheduled",
          label: "Scheduled triggers",
          description:
            "Create and run automations for chat, command, tool, and delegation flows.",
          status: hasAgentRuntime ? "available" : "offline",
        },
        {
          id: "delegation",
          label: "Agents & delegation",
          description:
            "Create specialists, open channels, dispatch delegations, and review work across the workspace.",
          status: "available",
        },
        {
          id: "integrations",
          label: "Tools & integrations",
          description:
            "Manage secrets, bindings, HTTP tools, provider accounts, and runtime-backed integrations.",
          status: hasAgentRuntime ? "available" : "partial",
        },
        {
          id: "services",
          label: "Services",
          description:
            "Run and inspect local runtime-backed services, workspace devices, browser sessions, and command runs.",
          status: hasAgentRuntime ? "available" : "offline",
        },
        {
          id: "interaction",
          label: "User interaction",
          description:
            "Ask follow-ups in-thread, keep work in Galaxy when simple, or escalate to collaboration when needed.",
          status: "available",
        },
      ] as const,
    [hasAgentRuntime],
  );
  const builtInSkillRows = useMemo(
    () =>
      builtInSkillCatalog.map((skill) => ({
        ...skill,
        status: hasAgentRuntime ? "available" : "partial",
      })),
    [hasAgentRuntime],
  );
  const selectedAgentCapabilityGroups = useMemo(
    () => (selectedAgent ? capabilitySummary(selectedAgent.permissions) : []),
    [selectedAgent],
  );
  const selectedAgentSkillRows = useMemo(() => {
    if (!selectedAgent) {
      return [];
    }

    const normalizedSkills = selectedAgent.skills.map((skill) =>
      skill.toLowerCase(),
    );

    return builtInSkillRows.map((skill) => {
      const matchedByName = normalizedSkills.some((entry) =>
        skill.keywords.some((keyword) => entry.includes(keyword)),
      );
      const hasRequiredPermissions = skill.requiredPermissions.every(
        (permission) => selectedAgent.permissions[permission],
      );

      return {
        ...skill,
        matchedByName,
        hasRequiredPermissions,
        state: matchedByName
          ? "enabled"
          : hasRequiredPermissions
            ? "ready"
            : "blocked",
      };
    });
  }, [builtInSkillRows, selectedAgent]);
  const consolidatedRuns = useMemo(() => {
    const uniqueRuns = new Map<string, CommandRun>();

    [...runtimeRuns, ...commandRuns].forEach((run) => {
      const key = run.runtimeRunId || run.id;
      const existing = uniqueRuns.get(key);
      if (!existing || existing.createdAt.localeCompare(run.createdAt) < 0) {
        uniqueRuns.set(key, run);
      }
    });

    return [...uniqueRuns.values()];
  }, [commandRuns, runtimeRuns]);
  const agentPresenceById = useMemo(() => {
    return Object.fromEntries(
      allAgents.map((agent) => {
        const thread = messagesByAgent[agent.id] ?? [];
        const lastRelevantMessage =
          [...thread].reverse().find((message) => message.role !== "system") ??
          null;
        const agentRuns = consolidatedRuns
          .filter((run) => run.agentId === agent.id)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
        const latestRun = agentRuns[0] ?? null;
        const runningActivities = liveActivityEntries.filter(
          (entry) => entry.agentId === agent.id && entry.status === "running",
        );
        const recentActivities = liveActivityEntries
          .filter((entry) => entry.agentId === agent.id)
          .slice(0, 4);
        const inFlightRuns = agentRuns.filter((run) =>
          runIsInFlight(run.status),
        );
        const hasError =
          agent.status === "error" || runNeedsAttention(latestRun?.status);
        const hasRunning =
          agent.status === "active" ||
          replyingAgentId === agent.id ||
          runningActivities.length > 0 ||
          inFlightRuns.length > 0;
        const needsReview =
          !hasRunning &&
          !hasError &&
          lastRelevantMessage?.role === "assistant" &&
          selectedAgentId !== agent.id;
        const tone: PresenceTone = hasError
          ? "error"
          : hasRunning
            ? "running"
            : needsReview
              ? "review"
              : "idle";
        const headline =
          tone === "running"
            ? agent.currentActivity ||
              runningActivities[0]?.label ||
              "Working on a response"
            : tone === "review"
              ? "Finished a step and is ready for your review"
              : tone === "error"
                ? latestRun?.error ||
                  agent.currentActivity ||
                  "Something went wrong in the last run"
                : `${agent.provider} · ${agent.model}`;
        const timeline =
          tone === "running"
            ? `${Math.max(runningActivities.length, inFlightRuns.length, 1)} live step${Math.max(runningActivities.length, inFlightRuns.length, 1) === 1 ? "" : "s"}`
            : tone === "review"
              ? `Waiting on your next instruction`
              : tone === "error"
                ? "Needs attention"
                : "Standing by";
        const stepLabels = (
          tone === "running" ? runningActivities : recentActivities
        )
          .map((entry) => entry.label)
          .filter(Boolean)
          .slice(0, 2);

        return [
          agent.id,
          {
            tone,
            headline,
            timeline,
            stepLabels,
            runCount: agentRuns.length,
          },
        ];
      }),
    ) as Record<
      string,
      {
        tone: PresenceTone;
        headline: string;
        timeline: string;
        stepLabels: string[];
        runCount: number;
      }
    >;
  }, [
    allAgents,
    consolidatedRuns,
    liveActivityEntries,
    messagesByAgent,
    replyingAgentId,
    selectedAgentId,
  ]);
  const activityFocusPresence = activityFocusAgent
    ? agentPresenceById[activityFocusAgent.id]
    : null;
  const channelPresenceById = useMemo(() => {
    return Object.fromEntries(
      channels.map((channel) => {
        const roomMessages = channelMessagesById[channel.id] ?? [];
        const lastRelevantMessage =
          [...roomMessages]
            .reverse()
            .find((message) => message.role !== "system") ?? null;
        const roomTasks = delegations.filter(
          (task) => task.channelId === channel.id,
        );
        const activeTasks = roomTasks.filter(
          (task) => task.status === "active",
        );
        const blockedTasks = roomTasks.filter(
          (task) => task.status === "blocked",
        );
        const hasRunning =
          activeTasks.length > 0 ||
          (isChannelCollaborating && selectedChannelId === channel.id);
        const hasError =
          channel.status === "blocked" || blockedTasks.length > 0;
        const needsReview =
          !hasRunning &&
          !hasError &&
          lastRelevantMessage?.role === "agent" &&
          selectedChannelId !== channel.id;
        const tone: PresenceTone = hasError
          ? "error"
          : hasRunning
            ? "running"
            : needsReview
              ? "review"
              : "idle";
        const headline =
          tone === "running"
            ? `${activeTasks.length > 0 ? activeTasks.length : 1} delegated slice${activeTasks.length === 1 ? "" : "s"} in motion`
            : tone === "review"
              ? "New specialist update is waiting inside the room"
              : tone === "error"
                ? "A room task is blocked"
                : channel.objective || "Shared channel conversation";
        const timeline =
          tone === "running"
            ? "Parallel work is live"
            : tone === "review"
              ? "Open the room to review the latest reply"
              : tone === "error"
                ? "Attention needed"
                : `${channel.memberAgentIds.length} agents · ${formatRelativeTime(channel.updatedAt)}`;

        return [
          channel.id,
          {
            tone,
            headline,
            timeline,
          },
        ];
      }),
    ) as Record<
      string,
      { tone: PresenceTone; headline: string; timeline: string }
    >;
  }, [
    channelMessagesById,
    channels,
    delegations,
    isChannelCollaborating,
    selectedChannelId,
  ]);

  function resolveCouncilIdentity(agentId: string) {
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

  async function handleStartCouncilSession() {
    const nextQuestion = councilDraft.trim();
    if (!nextQuestion) {
      return;
    }

    setIsStartingCouncil(true);
    setCouncilError(null);

    const result = await startCouncil(nextQuestion);

    if (!result.ok) {
      setCouncilError(result.error ?? "Failed to start council.");
      setIsStartingCouncil(false);
      return;
    }

    setCouncilDraft("");
    if (result.sessionId) {
      setSelectedCouncilSessionId(result.sessionId);
    }
    setWorkspaceView("council");
    setIsStartingCouncil(false);
  }

  async function handleSendCouncilReply() {
    if (!selectedCouncilSession) {
      return;
    }

    const nextMessage = councilReplyDraft.trim();
    if (!nextMessage) {
      return;
    }

    setIsSendingCouncilMessage(true);
    setCouncilError(null);

    const result = await sendCouncilMessage(
      selectedCouncilSession.id,
      nextMessage,
    );

    if (!result.ok) {
      setCouncilError(result.error ?? "Failed to send council message.");
      setIsSendingCouncilMessage(false);
      return;
    }

    setCouncilReplyDraft("");
    setIsSendingCouncilMessage(false);
  }

  return (
    <div className="relative flex h-[100dvh] w-full overflow-hidden bg-[radial-gradient(1200px_circle_at_70%_-10%,rgba(59,130,246,0.10),transparent_45%),#0b0f14] font-sans text-[#e6edf3]">
      {/* Sidebar */}
      <Sidebar
        sidebarWidth={sidebarWidth}
        setIsCreateAgentOpen={setIsCreateAgentOpen}
        allAgents={allAgents}
        agentPresenceById={agentPresenceById}
        selectedAgentId={selectedAgentId}
        workspaceView={workspaceView}
        setSelectedAgentId={setSelectedAgentId}
        setWorkspaceView={setWorkspaceView}
        handleEditAgent={handleEditAgent}
        setIsCreateChannelOpen={setIsCreateChannelOpen}
        channels={channels}
        selectedChannel={selectedChannel || null}
        setSelectedChannelId={setSelectedChannelId}
        councilSessions={councilSessions}
        selectedCouncilSession={selectedCouncilSession || null}
        setSelectedCouncilSessionId={setSelectedCouncilSessionId}
        viewItems={viewItems}
        isResizingSidebarRef={isResizingSidebarRef}
      />

      {/* Main Content Area */}
      <main className="relative z-10 flex min-w-0 flex-1 flex-col bg-[#0e1117]">
        {/* Top Bar — Minimal like Nebula */}
        <TopBanner
          selectedAgent={selectedAgent || undefined}
          workspaceView={workspaceView}
          topPanelTitle={topPanelTitle}
          topPanelSubtitle={topPanelSubtitle}
          topPanelMetaLine={topPanelMetaLine}
          workspaceSyncMode={workspaceSyncMode}
          handleEditAgent={handleEditAgent}
          badge={<WorkspaceSyncBadge mode={workspaceSyncMode} />}
        />

        {/* ── Nebula: Agent Thought Breadcrumb Bar ───────────────────── */}
        <AnimatePresence>
          {latestAgentRun && latestAgentRun.status === "running" && selectedAgent && (
            <motion.div
              key="thought-breadcrumb"
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className="relative flex items-center gap-2 overflow-hidden border-b border-[#1a2030] bg-[linear-gradient(90deg,rgba(11,17,25,0.95),rgba(15,22,33,0.92))] px-5 py-2"
            >
              {/* Scanning line */}
              <motion.div
                className="pointer-events-none absolute inset-0 h-px bg-gradient-to-r from-transparent via-[#3b82f6]/40 to-transparent"
                animate={{ x: ["-100%", "200%"] }}
                transition={{ duration: 2.8, ease: "linear", repeat: Infinity }}
              />
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#3b82f6] nebula-beacon" />
              <span className="text-[11px] font-medium text-[#6e7f93]">{selectedAgent.emoji} {selectedAgent.name}</span>
              <span className="text-[10px] text-[#3a4f63]">›</span>
              <span className="text-[11px] text-[#4f6880]">
                {latestAgentRun.activityLabel ?? "Executing"}
              </span>
              <span className="text-[10px] text-[#3a4f63]">›</span>
              <span className="nebula-breadcrumb-active truncate text-[11px] font-mono">
                {latestAgentRun.command?.slice(0, 60)}{(latestAgentRun.command?.length ?? 0) > 60 ? "…" : ""}
              </span>
              <span className="ml-auto shrink-0 text-[10px] text-[#3a4f63]">streaming</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Thread View */}
        <ScrollArea className="flex-1 px-6 py-6">
          <div
            className={cn(
              "mx-auto flex flex-col gap-6 pb-36",
              workspaceView === "channels"
                ? "max-w-[1580px]"
                : workspaceView === "council"
                  ? "max-w-[1240px]"
                  : "max-w-[900px]",
            )}
          >
            {workspaceView === "channels" && (
              <div className="mt-2 grid min-h-[780px] grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
                <div className="flex min-h-[760px] flex-col overflow-hidden rounded-[28px] border border-white/6 bg-[linear-gradient(180deg,rgba(11,18,28,0.92),rgba(8,14,23,0.88))] shadow-[0_18px_48px_rgba(2,6,23,0.14)]">
                  {selectedChannel ? (
                    <>
                      <div className="border-b border-white/6 bg-[linear-gradient(180deg,rgba(15,23,35,0.9),rgba(11,17,27,0.82))] px-7 py-6">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#3b82f6]/18 bg-[linear-gradient(180deg,rgba(37,99,235,0.88),rgba(29,78,216,0.66))] text-[12px] font-semibold text-white">
                                #
                              </div>
                              <div>
                                <p className="text-[26px] font-semibold text-[#f5fbff]">
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
            )}
            {workspaceView === "council" && (
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
            )}
            {workspaceView === "delegations" && (
              <div className="mt-2 overflow-hidden rounded-3xl border border-white/8 bg-[linear-gradient(180deg,rgba(18,27,39,0.92),rgba(11,17,26,0.88))] shadow-[0_18px_48px_rgba(2,6,23,0.18)]">
                <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-[#eef6fb]">
                      Delegations
                    </p>
                    <p className="text-[12px] text-[#8296ab]">
                      Every handoff across the workspace, including
                      channel-created tasks.
                    </p>
                  </div>
                  <Badge variant="cyan">{delegations.length} total</Badge>
                </div>
                <div className="divide-y divide-white/6">
                  {delegations.length > 0 ? (
                    delegations.map((task) => (
                      <div key={task.id} className="px-5 py-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-[14px] font-medium text-[#edf4f8]">
                                {task.title}
                              </p>
                              <Badge
                                variant={
                                  delegationMeta[task.status].badgeVariant
                                }
                              >
                                {delegationMeta[task.status].label}
                              </Badge>
                              <Badge
                                variant={
                                  priorityMeta[task.priority].badgeVariant
                                }
                              >
                                {priorityMeta[task.priority].label}
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
                            <p className="mt-2 text-[12px] leading-relaxed text-[#8ea0b5]">
                              {task.notes || task.payload || "No extra notes."}
                            </p>
                            <p className="mt-2 text-[11px] text-[#70849a]">
                              {allAgents.find(
                                (agent) => agent.id === task.fromAgentId,
                              )?.name || task.fromAgentId}{" "}
                              →{" "}
                              {allAgents.find(
                                (agent) => agent.id === task.assigneeId,
                              )?.name || task.assigneeId}
                              {task.channelId
                                ? ` · channel ${channels.find((channel) => channel.id === task.channelId)?.title || task.channelId}`
                                : ""}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {task.status !== "done" && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  void dispatchDelegationTask(task)
                                }
                                className="h-8 rounded-xl border border-white/8 px-3 text-[11px] text-[#c3d0dc] hover:bg-white/[0.05]"
                              >
                                Dispatch
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => cycleDelegationStatus(task.id)}
                              className="h-8 rounded-xl border border-white/8 px-3 text-[11px] text-[#c3d0dc] hover:bg-white/[0.05]"
                            >
                              Advance
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="px-5 py-10 text-[12px] text-[#6e7f93]">
                      No delegations yet. Create one directly or let a channel
                      round generate them.
                    </div>
                  )}
                </div>
              </div>
            )}
            {workspaceView === "accounts" && (
              <div className="space-y-4 mt-2">
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                  <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 p-4">
                    <DigitalTwinPanel />
                  </div>
                  <ApprovalQueue className="self-start" />
                </div>

                <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#1e252e]">
                    <p className="text-sm font-semibold text-[#e2e8f0]">
                      Control Room Built-in
                    </p>
                    <p className="text-[12px] text-[#8b949e]">
                      Nebula-style built-in capabilities, backed by the runtime
                      and workspace features already wired here.
                    </p>
                  </div>
                  <div className="divide-y divide-[#1e252e]">
                    {builtInToolRows.map((tool) => (
                      <div
                        key={tool.id}
                        className="px-4 py-3 flex items-start justify-between gap-4"
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <div
                            className={cn(
                              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border",
                              tool.status === "available"
                                ? "border-[#10b981]/25 bg-[#10b981]/10 text-[#34d399]"
                                : tool.status === "partial"
                                  ? "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#fbbf24]"
                                  : "border-white/10 bg-white/[0.03] text-[#6e7681]",
                            )}
                          >
                            <Check className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[15px] font-medium text-[#e2e8f0]">
                              {tool.label}
                            </p>
                            <p className="mt-1 text-[12px] leading-relaxed text-[#8b949e]">
                              {tool.description}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant={
                            tool.status === "available"
                              ? "emerald"
                              : tool.status === "partial"
                                ? "amber"
                                : "muted"
                          }
                        >
                          {tool.status === "available"
                            ? "Available"
                            : tool.status === "partial"
                              ? "Partial"
                              : "Offline"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </div>

                {selectedAgent ? (
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                    <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 p-4">
                      <TrustPolicyEditor
                        agentId={selectedAgent.id}
                        agentName={selectedAgent.name}
                      />
                    </div>
                    <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 p-4">
                      <ReflectionPanel
                        agentId={selectedAgent.id}
                        agentName={selectedAgent.name}
                        currentSystemPrompt={selectedAgent.systemPrompt}
                        onApplyPatch={(patchedPrompt) => {
                          updateCustomAgent(selectedAgent.id, (agent) => ({
                            ...agent,
                            systemPrompt: patchedPrompt,
                          }));
                        }}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#1e252e]">
                    <p className="text-sm font-semibold text-[#e2e8f0]">
                      Workspace Skill Packs
                    </p>
                    <p className="text-[12px] text-[#8b949e]">
                      Reusable specialist skills for document work, browser QA,
                      GitHub workflows, research, and deployment tasks.
                    </p>
                  </div>
                  <div className="divide-y divide-[#1e252e]">
                    {builtInSkillRows.map((skill) => {
                      const Icon = skill.icon;
                      return (
                        <div
                          key={skill.id}
                          className="px-4 py-3 flex items-start justify-between gap-4"
                        >
                          <div className="flex min-w-0 items-start gap-3">
                            <div
                              className={cn(
                                "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                                skill.status === "available"
                                  ? "border-[#06b6d4]/25 bg-[#06b6d4]/10 text-[#67e8f9]"
                                  : "border-[#f59e0b]/25 bg-[#f59e0b]/10 text-[#fbbf24]",
                              )}
                            >
                              <Icon className="h-4 w-4" />
                            </div>
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[15px] font-medium text-[#e2e8f0]">
                                  {skill.label}
                                </p>
                                {skill.requiredPermissions.map((permission) => (
                                  <span
                                    key={`${skill.id}-${permission}`}
                                    className="inline-flex items-center rounded-full border border-white/8 bg-white/[0.03] px-2 py-0.5 text-[10px] uppercase tracking-[0.14em] text-[#6e7f93]"
                                  >
                                    {permission}
                                  </span>
                                ))}
                              </div>
                              <p className="mt-1 text-[12px] leading-relaxed text-[#8b949e]">
                                {skill.description}
                              </p>
                            </div>
                          </div>
                          <Badge
                            variant={
                              skill.status === "available" ? "cyan" : "amber"
                            }
                          >
                            {skill.status === "available"
                              ? "Ready"
                              : "Runtime Needed"}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#1e252e]">
                    <p className="text-sm font-semibold text-[#e2e8f0]">
                      Agent Skill Surface
                    </p>
                    <p className="text-[12px] text-[#8b949e]">
                      {selectedAgent
                        ? `Skill readiness for ${selectedAgent.name}. Add matching skill tags in the agent editor to make these specialties explicit.`
                        : "Select an agent to inspect which skill packs it can handle right now."}
                    </p>
                  </div>
                  {selectedAgent ? (
                    <div className="divide-y divide-[#1e252e]">
                      <div className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-lg">{selectedAgent.emoji}</span>
                          <p className="text-[14px] font-medium text-[#e2e8f0]">
                            {selectedAgent.name}
                          </p>
                          <Badge variant="muted">
                            {selectedAgent.provider} · {selectedAgent.model}
                          </Badge>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {selectedAgent.skills.length > 0 ? (
                            selectedAgent.skills.map((skill) => (
                              <span
                                key={`${selectedAgent.id}-${skill}`}
                                className="inline-flex items-center rounded-full border border-[#10b981]/20 bg-[#10b981]/10 px-2.5 py-1 text-[11px] text-[#86efac]"
                              >
                                {skill}
                              </span>
                            ))
                          ) : (
                            <span className="text-[12px] text-[#6e7681]">
                              No explicit skill tags yet.
                            </span>
                          )}
                        </div>
                      </div>
                      {selectedAgentSkillRows.map((skill) => {
                        const Icon = skill.icon;
                        return (
                          <div
                            key={`agent-skill-${skill.id}`}
                            className="px-4 py-3 flex items-start justify-between gap-4"
                          >
                            <div className="flex min-w-0 items-start gap-3">
                              <div
                                className={cn(
                                  "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
                                  skill.state === "enabled"
                                    ? "border-[#10b981]/25 bg-[#10b981]/10 text-[#34d399]"
                                    : skill.state === "ready"
                                      ? "border-[#06b6d4]/25 bg-[#06b6d4]/10 text-[#67e8f9]"
                                      : "border-white/10 bg-white/[0.03] text-[#6e7681]",
                                )}
                              >
                                <Icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="text-[14px] font-medium text-[#e2e8f0]">
                                    {skill.label}
                                  </p>
                                  {skill.matchedByName ? (
                                    <Badge variant="emerald">Tagged</Badge>
                                  ) : null}
                                </div>
                                <p className="mt-1 text-[12px] leading-relaxed text-[#8b949e]">
                                  {skill.description}
                                </p>
                                <p className="mt-2 text-[11px] text-[#6e7681]">
                                  Needs {skill.requiredPermissions.join(" + ")}{" "}
                                  permissions
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant={
                                skill.state === "enabled"
                                  ? "emerald"
                                  : skill.state === "ready"
                                    ? "cyan"
                                    : "muted"
                              }
                            >
                              {skill.state === "enabled"
                                ? "Enabled"
                                : skill.state === "ready"
                                  ? "Ready"
                                  : "Blocked"}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-6 text-center text-[12px] text-[#6e7681]">
                      Pick an agent from the sidebar and this panel will show
                      which skill packs it can take on.
                    </div>
                  )}
                </div>

                <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#1e252e]">
                    <p className="text-sm font-semibold text-[#e2e8f0]">
                      Provider Accounts
                    </p>
                    <p className="text-[12px] text-[#8b949e]">
                      API keys and OAuth connections available to agents.
                    </p>
                  </div>
                  <div className="divide-y divide-[#1e252e]">
                    {providerPresets.map((preset) => {
                      const isCopilot = preset.provider === "Copilot";
                      const isGitHub = preset.provider === "GitHub";
                      const isActive = isCopilot
                        ? copilotAuthenticated
                        : isGitHub
                          ? githubModelsReady
                          : false;

                      return (
                        <div
                          key={`${preset.provider}-${preset.model}`}
                          className="px-4 py-3 flex items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div
                              className={cn(
                                "w-8 h-8 rounded-md flex items-center justify-center text-[11px] font-bold",
                                isActive
                                  ? "bg-[#10b981]/15 text-[#34d399]"
                                  : "bg-[#1e252e] text-[#6e7681]",
                              )}
                            >
                              {preset.provider.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-[#e2e8f0] truncate">
                                {preset.provider}
                              </p>
                              <p className="text-[11px] text-[#6e7681] truncate">
                                {presetDisplayModel(preset)}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={isActive ? "emerald" : "muted"}>
                              {isActive ? "Connected" : "Not Configured"}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#1e252e]">
                    <p className="text-sm font-semibold text-[#e2e8f0]">
                      Agent Bindings
                    </p>
                    <p className="text-[12px] text-[#8b949e]">
                      Which provider and model each agent uses.
                    </p>
                  </div>
                  <div className="divide-y divide-[#1e252e]">
                    {allAgents.filter((a) => a.source === "custom").length >
                    0 ? (
                      allAgents
                        .filter((a) => a.source === "custom")
                        .map((agent) => (
                          <div
                            key={agent.id}
                            className="px-4 py-3 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="text-lg">{agent.emoji}</span>
                              <div className="min-w-0">
                                <p className="text-[13px] font-medium text-[#e2e8f0] truncate">
                                  {agent.name}
                                </p>
                                <p className="text-[11px] text-[#6e7681]">
                                  {agent.provider} · {agent.model}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge
                                variant={
                                  agent.sandboxMode === "workspace-write"
                                    ? "emerald"
                                    : "amber"
                                }
                              >
                                {agent.sandboxMode}
                              </Badge>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="px-4 py-6 text-center text-[12px] text-[#6e7681]">
                        No custom agents yet. Create one to configure provider
                        bindings.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
                  <div className="flex items-center justify-between gap-3 border-b border-[#1e252e] px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-[#e2e8f0]">
                        Event Triggers & Automations
                      </p>
                      <p className="text-[12px] text-[#8b949e]">
                        Phase 2 event entrypoints for scheduled, webhook, repo,
                        and manual workspace runs.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="muted">{automations.length} loaded</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void refreshAutomations()}
                        disabled={isLoadingAutomations}
                        className="h-8 px-2.5 text-[11px]"
                      >
                        {isLoadingAutomations ? "Refreshing..." : "Refresh"}
                      </Button>
                    </div>
                  </div>
                  {automationError ? (
                    <div className="border-b border-red-900/30 bg-[#3f191f]/20 px-4 py-2 text-[12px] text-[#fda4af]">
                      {automationError}
                    </div>
                  ) : null}
                  <div className="divide-y divide-[#1e252e]">
                    {automations.length > 0 ? (
                      automations.map((automation) => {
                        const latestRun =
                          automationRunsById[automation.id]?.[0] ?? null;
                        const isTriggering =
                          isTriggeringAutomationId === automation.id;

                        return (
                          <div
                            key={automation.id}
                            className="px-4 py-3 flex items-start justify-between gap-4"
                          >
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <p className="text-[14px] font-medium text-[#e2e8f0]">
                                  {automation.name}
                                </p>
                                <Badge
                                  variant={
                                    automation.status === "active"
                                      ? "emerald"
                                      : automation.status === "error"
                                        ? "danger"
                                        : automation.status === "paused"
                                          ? "amber"
                                          : "muted"
                                  }
                                >
                                  {automation.status}
                                </Badge>
                                <Badge variant="cyan">
                                  {getTriggerTypeLabel(automation.trigger.type)}
                                </Badge>
                                <Badge variant="muted">
                                  {automation.action.type.replace(/_/g, " ")}
                                </Badge>
                              </div>
                              <p className="mt-1 text-[12px] text-[#8b949e]">
                                Agent: {automation.agentName} · Runs:{" "}
                                {automation.runCount} · Errors:{" "}
                                {automation.errorCount}
                              </p>
                              <p className="mt-2 text-[12px] leading-relaxed text-[#6e7681]">
                                Last status:{" "}
                                {automation.lastRunStatus || "Never run"}
                                {automation.lastRunAt
                                  ? ` · ${formatRelativeTime(automation.lastRunAt)}`
                                  : ""}
                              </p>
                              {latestRun ? (
                                <p className="mt-1 text-[11px] leading-relaxed text-[#6e7f93]">
                                  Latest recorded run: {latestRun.status}
                                  {latestRun.completedAt
                                    ? ` · completed ${formatRelativeTime(latestRun.completedAt)}`
                                    : ` · triggered ${formatRelativeTime(latestRun.triggeredAt)}`}
                                  {latestRun.error
                                    ? ` · ${latestRun.error}`
                                    : ""}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() =>
                                  void handleTriggerAutomation(automation.id)
                                }
                                disabled={
                                  isTriggering ||
                                  automation.status === "disabled"
                                }
                                className="h-8 rounded-xl border border-white/8 px-3 text-[11px] text-[#c3d0dc] hover:bg-white/[0.05]"
                              >
                                {isTriggering ? "Triggering..." : "Run Now"}
                              </Button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="px-4 py-6 text-center text-[12px] text-[#6e7681]">
                        {hasAgentRuntime
                          ? "No automations yet. Phase 2 trigger plumbing is ready for schedules and event hooks."
                          : "Runtime is offline, so automations are unavailable right now."}
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#1e252e]">
                    <p className="text-sm font-semibold text-[#e2e8f0]">
                      Health Checks
                    </p>
                    <p className="text-[12px] text-[#8b949e]">
                      Live provider connectivity status.
                    </p>
                  </div>
                  <div className="divide-y divide-[#1e252e]">
                    {runtimeHealth?.providers &&
                      Object.entries(runtimeHealth.providers).map(
                        ([provider, available]) => (
                          <div
                            key={provider}
                            className="px-4 py-3 flex items-center justify-between gap-3"
                          >
                            <span className="text-[13px] text-[#c9d1d9] capitalize">
                              {provider.replace(/([A-Z])/g, " $1")}
                            </span>
                            <Badge variant={available ? "emerald" : "muted"}>
                              {available ? "Available" : "Unavailable"}
                            </Badge>
                          </div>
                        ),
                      )}
                  </div>
                </div>
              </div>
            )}
            {workspaceView === "activity" && (
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
                                  runIsInFlight(run.status) &&
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
                                    <span className="text-[#4f6880]">•</span>
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
                          inspect the workspace and they’ll appear here.
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
                                  · {formatRelativeTime(selectedActivityRun.createdAt)}
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
                                  {activityFocusAgent.emoji || "🤖"}
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
                                    {activityFocusAgent.provider} ·{" "}
                                    {activityFocusAgent.model} ·{" "}
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
            )}
            {workspaceView === "chat" && (
              <div className="space-y-4">
                {selectedAgent ? (
                  <HandoffBanner
                    currentAgentId={selectedAgent.id}
                    onAccept={(instruction) => {
                      setChatDraft(instruction);
                    }}
                  />
                ) : null}
                {selectedAgent ? (
                  <div className="overflow-hidden rounded-[28px] bg-[linear-gradient(180deg,rgba(15,21,32,0.42),rgba(9,14,22,0.08))]">
                    <div className="flex items-center justify-between gap-3 border-b border-white/[0.05] px-4 py-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <div
                          className="command-deck-orb relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/10 text-[16px] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                          style={{
                            backgroundColor: selectedAgent.accent || "#3b82f6",
                          }}
                        >
                          {selectedAgent.emoji}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-[16px] font-semibold tracking-[-0.02em] text-[#eef6fb]">
                            {selectedAgent.name}
                          </p>
                          <p className="truncate text-[11px] uppercase tracking-[0.18em] text-[#6e8398]">
                            {selectedAgent.provider} · {selectedAgent.model}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="muted">
                          {agentPresenceById[selectedAgent.id]?.timeline || "Standing by"}
                        </Badge>
                        <button
                          type="button"
                          onClick={() => {
                            setActivityDrawerTab("activity");
                            setIsActivityDrawerOpen(true);
                          }}
                          className="rounded-xl bg-white/[0.03] px-3 py-1.5 text-[11px] text-[#c9d4df] transition-colors hover:bg-white/[0.05] hover:text-[#eef6fb]"
                        >
                          Open activity
                        </button>
                      </div>
                    </div>
                    <div className="space-y-5 px-4 py-5">
                      <ThreadTurns
                        messages={selectedThread}
                        selectedAgent={
                          selectedAgent
                            ? {
                                id: selectedAgent.id,
                                name: selectedAgent.name,
                                emoji: selectedAgent.emoji,
                                provider: selectedAgent.provider,
                                model: selectedAgent.model,
                              }
                            : undefined
                        }
                        attachmentLibrary={attachmentLibrary}
                        agentPresenceById={agentPresenceById}
                        renderMessageHtml={renderMessageHtml}
                        presenceDotClasses={presenceDotClasses}
                        presenceTextClasses={presenceTextClasses}
                        onViewActivity={() => {
                          setActivityDrawerTab("activity");
                          setIsActivityDrawerOpen(true);
                        }}
                        onRunCodeBlock={(input) => {
                          if (!selectedAgent) {
                            return;
                          }
                          void handleRunCodeBlockInSandbox({
                            agent: selectedAgent,
                            code: input.code,
                            language: input.language,
                          });
                        }}
                      />
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {chatError && (
              <div className="ml-12 mr-8 p-3 rounded-md border border-red-900/50 bg-[#3f191f]/30">
                <div className="flex gap-2.5 items-start text-red-400">
                  <span className="mt-1 flex-shrink-0">⚠️</span>
                  <div>
                    <div className="font-semibold text-[13px]">Error</div>
                    <div className="text-[#d87b87] text-[13px] mt-0.5">
                      {chatError}
                    </div>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        {/* Bottom Input Area */}
        {workspaceView === "chat" && (
          <div className="absolute bottom-6 left-0 right-0 px-6">
            <div className="relative mx-auto max-w-[900px]">
              <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,27,39,0.94),rgba(12,18,28,0.9))] shadow-[0_22px_56px_rgba(2,6,23,0.22)] backdrop-blur-xl transition-colors focus-within:border-[#6b9cff]/28">
                <input
                  ref={chatFileInputRef}
                  type="file"
                  multiple
                  accept="image/*,.txt,.md,.markdown,.json,.csv,.tsv,.js,.jsx,.ts,.tsx,.py,.sql,.html,.css,.xml,.yaml,.yml,.pdf,.doc,.docx"
                  className="hidden"
                  onChange={(event) => {
                    if (event.target.files?.length) {
                      void ingestComposerFiles(event.target.files, "chat");
                      event.target.value = "";
                    }
                  }}
                />
                {chatDraftAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 border-b border-white/8 px-4 py-3">
                    {chatDraftAttachments.map((attachment) => (
                      <div
                        key={attachment.id}
                        className="inline-flex max-w-[280px] items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-[11px] text-[#d9e4ee]"
                      >
                        {attachment.kind === "image" ? (
                          <ImageIcon className="h-3.5 w-3.5 text-[#8fd3ff]" />
                        ) : (
                          <FileText className="h-3.5 w-3.5 text-[#b5c7d8]" />
                        )}
                        <span className="truncate">{attachment.name}</span>
                        <button
                          type="button"
                          onClick={() =>
                            removeDraftAttachment("chat", attachment.id)
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
                  value={chatDraft}
                  onChange={(e) => setChatDraft(e.target.value)}
                  placeholder="Ask this agent to inspect code, run checks, debug, or delegate work..."
                  className="min-h-[72px] w-full resize-none bg-transparent px-5 py-4 text-[14px] text-[#edf4f8] placeholder-[#70849a] focus:outline-none"
                  onPaste={(event) => {
                    if (event.clipboardData.files.length > 0) {
                      event.preventDefault();
                      void ingestComposerFiles(
                        event.clipboardData.files,
                        "chat",
                      );
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      if (chatDraft.trim() || chatDraftAttachments.length > 0) {
                        handleSendMessage(e as any);
                      }
                    }
                  }}
                />
                {chatAttachmentError && (
                  <div className="border-t border-white/8 px-4 py-3 text-[11px] text-[#f5a1a1]">
                    {chatAttachmentError}
                  </div>
                )}
                <div className="flex flex-col gap-3 border-t border-white/8 px-4 py-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[#9fb0c3]">
                      {selectedAgent?.provider || "OpenAI"} ·{" "}
                      {selectedAgent?.model || "GPT-4"}
                    </span>
                    {selectedAgent?.permissions.terminal && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-[#818cf8]/16 bg-[#818cf8]/8 px-2.5 py-1 text-[#c7d2fe]">
                        <Terminal className="h-3 w-3" /> Sandbox
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => chatFileInputRef.current?.click()}
                      className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[#9fb0c3] transition-colors hover:border-white/16 hover:bg-white/[0.05] hover:text-[#edf4f8]"
                    >
                      <Paperclip className="h-3 w-3" /> Attach
                    </button>
                  </div>
                  <div className="flex items-center justify-between gap-2 md:justify-end">
                    <button
                      onClick={(e) => handleSendMessage(e as any)}
                      disabled={
                        (!chatDraft.trim() &&
                          chatDraftAttachments.length === 0) ||
                        isReplying
                      }
                      className="inline-flex items-center gap-2 rounded-xl bg-[linear-gradient(180deg,rgba(59,130,246,0.95),rgba(37,99,235,0.85))] px-3.5 py-2 text-[12px] font-medium text-white shadow-[0_16px_34px_rgba(37,99,235,0.28)] transition-all hover:brightness-110 disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Send
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {workspaceView === "observability" && (
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/50 p-3">
                <p className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                  Total Runs
                </p>
                <p className="mt-1 text-2xl font-semibold text-[#e2e8f0]">
                  {runtimeRuns.length}
                </p>
              </div>
              <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/50 p-3">
                <p className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                  Completed
                </p>
                <p className="mt-1 text-2xl font-semibold text-[#34d399]">
                  {runtimeRuns.filter((r) => r.status === "completed").length}
                </p>
              </div>
              <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/50 p-3">
                <p className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                  Failed
                </p>
                <p className="mt-1 text-2xl font-semibold text-[#f87171]">
                  {runtimeRuns.filter((r) => r.status === "failed").length}
                </p>
              </div>
              <div className="rounded-xl border border-[#1e252e] bg-[#161b22]/50 p-3">
                <p className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                  Avg Duration
                </p>
                <p className="mt-1 text-2xl font-semibold text-[#e2e8f0]">
                  {runtimeRuns.length > 0
                    ? `${Math.round(runtimeRuns.reduce((s, r) => s + (r.durationMs || 0), 0) / runtimeRuns.filter((r) => r.durationMs).length)}ms`
                    : "—"}
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1e252e]">
                <p className="text-sm font-semibold text-[#e2e8f0]">
                  Run Timeline
                </p>
                <p className="text-[12px] text-[#8b949e]">
                  Replayable history of all agent executions.
                </p>
              </div>
              <div className="divide-y divide-[#1e252e]">
                {runtimeRuns.slice(0, 15).map((run) => {
                  const rsm = runStatusMeta[run.status] || runStatusMeta.failed;
                  return (
                    <div
                      key={run.id}
                      className="px-4 py-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            run.status === "running" ||
                              run.status === "planning"
                              ? "bg-[#fbbf24] animate-pulse"
                              : run.status === "completed"
                                ? "bg-[#34d399]"
                                : run.status === "queued"
                                  ? "bg-[#818cf8]"
                                  : run.status === "waiting_for_approval"
                                    ? "bg-[#f59e0b]"
                                    : run.status === "blocked"
                                      ? "bg-[#fb7185]"
                                      : "bg-[#f87171]",
                          )}
                        ></div>
                        <div className="min-w-0">
                          <p className="text-[13px] text-[#e2e8f0] truncate">
                            {run.command}
                          </p>
                          <p className="text-[11px] text-[#6e7681]">
                            {run.agentName || run.agentId} ·{" "}
                            {formatRelativeTime(run.createdAt)}
                            {run.model && ` · ${run.provider}/${run.model}`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {run.durationMs != null && (
                          <span className="text-[10px] text-[#6e7681]">
                            {run.durationMs}ms
                          </span>
                        )}
                        {(run.retryCount ?? 0) > 0 && (
                          <span className="text-[9px] text-[#818cf8]">
                            retry {run.retryCount}
                          </span>
                        )}
                        <Badge variant={rsm.badgeVariant}>{rsm.label}</Badge>
                      </div>
                    </div>
                  );
                })}
                {runtimeRuns.length === 0 && (
                  <div className="px-4 py-8 text-center text-[12px] text-[#6e7681]">
                    No runs recorded yet.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1e252e]">
                <p className="text-sm font-semibold text-[#e2e8f0]">
                  Tool Invocations
                </p>
                <p className="text-[12px] text-[#8b949e]">
                  Recent tool calls across all agents.
                </p>
              </div>
              <div className="divide-y divide-[#1e252e]">
                {toolInvocationResults.slice(0, 10).map((result, i) => (
                  <div
                    key={i}
                    className="px-4 py-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-medium",
                          result.ok
                            ? "border-[#34d399]/30 bg-[#34d399]/10 text-[#6ee7b7]"
                            : "border-[#f87171]/30 bg-[#f87171]/10 text-[#fca5a5]",
                        )}
                      >
                        {result.tool}
                      </span>
                      {result.approvalRequired && (
                        <span className="text-[10px] text-[#fbbf24]">
                          approval needed
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {result.data?.durationMs != null && (
                        <span className="text-[10px] text-[#6e7681]">
                          {Number(result.data.durationMs)}ms
                        </span>
                      )}
                      <span
                        className={cn(
                          "text-[10px]",
                          result.ok ? "text-[#34d399]" : "text-[#f87171]",
                        )}
                      >
                        {result.ok ? "ok" : "failed"}
                      </span>
                    </div>
                  </div>
                ))}
                {toolInvocationResults.length === 0 && (
                  <div className="px-4 py-6 text-center text-[12px] text-[#6e7681]">
                    No tool invocations yet.
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
              <div className="px-4 py-3 border-b border-[#1e252e]">
                <p className="text-sm font-semibold text-[#e2e8f0]">
                  Agent Tool Surface
                </p>
                <p className="text-[12px] text-[#8b949e]">
                  {selectedAgent
                    ? `Capabilities currently enabled for ${selectedAgent.name}.`
                    : "Select an agent to inspect its enabled tools."}
                </p>
              </div>
              {selectedAgent ? (
                <div className="space-y-4 px-4 py-4">
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-[#e2e8f0]">
                        {selectedAgent.emoji} {selectedAgent.name}
                      </p>
                      <p className="mt-1 text-[11px] text-[#6e7681]">
                        {selectedAgent.provider} · {selectedAgent.model} ·{" "}
                        {selectedAgent.role}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="muted">
                        {deriveAgentHierarchy(selectedAgent)}
                      </Badge>
                      <Badge
                        variant={
                          selectedAgent.sandboxMode === "workspace-write"
                            ? "emerald"
                            : selectedAgent.sandboxMode === "read-only"
                              ? "amber"
                              : "muted"
                        }
                      >
                        {selectedAgent.sandboxMode}
                      </Badge>
                      <Badge
                        variant={
                          selectedAgent.status === "active"
                            ? "cyan"
                            : selectedAgent.status === "idle"
                              ? "muted"
                              : selectedAgent.status === "error"
                                ? "danger"
                                : "muted"
                        }
                      >
                        {selectedAgent.status}
                      </Badge>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                    {selectedAgentCapabilityGroups.length > 0 ? (
                      selectedAgentCapabilityGroups.map((group) => (
                        <div
                          key={group.category}
                          className="rounded-xl border border-white/8 bg-white/[0.02] p-3"
                        >
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="text-[13px] font-medium text-[#e2e8f0]">
                              {group.label}
                            </p>
                            <span className="text-[10px] uppercase tracking-[0.16em] text-[#6e8398]">
                              {group.tools.length} tools
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {group.tools.map((tool) => (
                              <span
                                key={tool.name}
                                className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[#0d1117] px-2.5 py-1 text-[10px] text-[#c8d3de]"
                              >
                                <span>{tool.name}</span>
                                {tool.requiresApproval && (
                                  <span className="rounded-full bg-[#f59e0b]/15 px-1.5 py-0.5 text-[9px] text-[#fbbf24]">
                                    approval
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-white/10 bg-white/[0.02] px-4 py-6 text-[12px] text-[#6e7681] xl:col-span-2">
                        This agent does not have any runtime tools enabled yet.
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="px-4 py-6 text-center text-[12px] text-[#6e7681]">
                  No agent selected.
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <TaskTreePanel
                taskTrees={selectedAgent ? taskTrees.filter((tree) => tree.rootAgentId === selectedAgent.id) : taskTrees}
                selectedTaskTreeId={selectedTaskTree?.id ?? null}
                onSelectTaskTree={setSelectedTaskTreeId}
              />
              <MemoryGraphPanel graph={selectedKnowledgeGraph} />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <VerifierPanel
                reviews={selectedVerifierReviews}
                selectedAgentId={selectedAgent?.id ?? null}
              />
              <div className="rounded-2xl border border-[#1e252e] bg-[#161b22]/50 overflow-hidden">
                <div className="border-b border-[#1e252e] px-4 py-3">
                  <p className="text-sm font-semibold text-[#e2e8f0]">
                    Plan Reviews & Circuit Breakers
                  </p>
                  <p className="text-[12px] text-[#8b949e]">
                    Strategic review gates, dispatcher snapshots, and loop intervention signals.
                  </p>
                </div>
                <div className="divide-y divide-[#1e252e]">
                  {latestDispatcherDecision ? (
                    <div className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-medium text-[#e2e8f0]">
                            Latest dispatch
                          </p>
                          <p className="mt-1 text-[11px] text-[#6e7681]">
                            {latestDispatcherDecision.intent} · {latestDispatcherDecision.lane} · score {latestDispatcherDecision.complexityScore}
                          </p>
                        </div>
                        <Badge
                          variant={
                            latestDispatcherDecision.riskLevel === "danger"
                              ? "danger"
                              : latestDispatcherDecision.riskLevel === "caution"
                                ? "amber"
                                : "emerald"
                          }
                        >
                          {latestDispatcherDecision.riskLevel}
                        </Badge>
                      </div>
                      <p className="mt-3 text-[12px] text-[#8b949e]">
                        {latestDispatcherDecision.reason}
                      </p>
                    </div>
                  ) : null}
                  {planReviews.slice(0, 3).map((review) => (
                    <button
                      key={review.id}
                      type="button"
                      onClick={() => setActivePlanReviewId(review.id)}
                      className="w-full px-4 py-3 text-left transition-colors hover:bg-[#111827]/50"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-medium text-[#e2e8f0]">
                            {review.title}
                          </p>
                          <p className="mt-1 text-[11px] text-[#6e7681]">
                            {review.steps.length} steps · {review.status}
                          </p>
                        </div>
                        <Badge
                          variant={
                            review.status === "approved"
                              ? "emerald"
                              : review.status === "rejected"
                                ? "danger"
                                : "amber"
                          }
                        >
                          {review.status}
                        </Badge>
                      </div>
                    </button>
                  ))}
                  {circuitBreakerEvents.slice(0, 3).map((event) => (
                    <div key={event.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[13px] font-medium text-[#e2e8f0]">
                          Circuit breaker
                        </p>
                        <Badge variant="danger">{event.resolution}</Badge>
                      </div>
                      <p className="mt-2 text-[12px] leading-relaxed text-[#8b949e]">
                        {event.reason}
                      </p>
                    </div>
                  ))}
                  {planReviews.length === 0 && circuitBreakerEvents.length === 0 && !latestDispatcherDecision ? (
                    <div className="px-4 py-6 text-[12px] text-[#6e7681]">
                      No orchestration reviews or intervention events yet.
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        )}

        <Dialog
          open={isCopilotAuthDialogOpen}
          onOpenChange={(nextOpen) => {
            setIsCopilotAuthDialogOpen(nextOpen);
            if (!nextOpen) {
              setCopilotAuthSession(null);
            }
          }}
        >
          <DialogContent className="max-w-lg border border-[#30363d] bg-[#0d1117] text-[#c9d1d9]">
            <DialogHeader>
              <DialogTitle className="text-[#e6edf3]">
                Connect GitHub Copilot OAuth
              </DialogTitle>
              <DialogDescription className="text-[#8b949e]">
                Authenticate once in your browser. The token stays local in this
                runtime process.
              </DialogDescription>
            </DialogHeader>

            {copilotAuthSession ? (
              <div className="space-y-4 text-sm">
                <div className="rounded-md border border-[#30363d] bg-[#161b22] p-3">
                  <p className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                    User code
                  </p>
                  <p className="mt-1 text-xl font-semibold tracking-[0.16em] text-[#e6edf3]">
                    {copilotAuthSession.userCode}
                  </p>
                </div>
                <div className="rounded-md border border-[#30363d] bg-[#161b22] p-3">
                  <p className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                    Verification URL
                  </p>
                  <a
                    href={
                      copilotAuthSession.verificationUriComplete ||
                      copilotAuthSession.verificationUri
                    }
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-flex text-[#58a6ff] hover:text-[#79c0ff]"
                  >
                    {copilotAuthSession.verificationUriComplete ||
                      copilotAuthSession.verificationUri}
                  </a>
                </div>
                <p className="text-[#8b949e] text-xs">
                  Waiting for authorization...
                  {isPollingCopilotAuth
                    ? " polling in progress."
                    : ` next check in ${copilotAuthSession.interval}s.`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-[#8b949e]">
                Start login from the top bar to generate a fresh device code.
              </p>
            )}

            {copilotAuthError && (
              <div className="rounded-md border border-red-900/50 bg-[#3f191f]/30 px-3 py-2 text-sm text-red-300">
                {copilotAuthError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsCopilotAuthDialogOpen(false)}
              >
                Close
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void handleStartCopilotAuth()}
                disabled={isStartingCopilotAuth || isPollingCopilotAuth}
              >
                {isStartingCopilotAuth ? "Starting..." : "Restart Flow"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isCreateAgentOpen}
          onOpenChange={(open) => {
            if (!open) {
              setEditingAgentId(null);
              setAgentDraft(emptyAgentDraft);
              setShowAllProviderPresets(false);
            }
            setIsCreateAgentOpen(open);
          }}
        >
          <DialogContent className="flex max-h-[92vh] w-[min(92vw,56rem)] max-w-3xl flex-col overflow-hidden border border-[#30363d] bg-[#0d1117] p-0 text-[#c9d1d9]">
            <DialogHeader className="shrink-0 border-b border-[#30363d] px-6 py-5">
              <DialogTitle className="text-[#e6edf3]">
                {editingAgentId ? "Edit Agent" : "Create Custom Agent"}
              </DialogTitle>
              <DialogDescription className="text-[#8b949e]">
                {editingAgentId
                  ? "Update provider, model, workspace, and permissions for your specialist."
                  : "Define provider, model, workspace, and permissions for your specialist."}
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleCreateAgent();
              }}
              className="flex min-h-0 flex-1 flex-col"
            >
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-6 py-5">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div>
                    <p className="mb-1 text-xs text-[#8b949e]">Agent name</p>
                    <Input
                      value={agentDraft.name}
                      onChange={(event) =>
                        setAgentDraft((current) => ({
                          ...current,
                          name: event.target.value,
                        }))
                      }
                      placeholder="Builder"
                      className="h-9 rounded-md bg-[#161b22] border-[#30363d]"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-[#8b949e]">Role</p>
                    <Input
                      value={agentDraft.role}
                      onChange={(event) =>
                        setAgentDraft((current) => ({
                          ...current,
                          role: event.target.value,
                        }))
                      }
                      placeholder="Implementation Engineer"
                      className="h-9 rounded-md bg-[#161b22] border-[#30363d]"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-[#8b949e]">Emoji</p>
                    <Input
                      value={agentDraft.emoji}
                      onChange={(event) =>
                        setAgentDraft((current) => ({
                          ...current,
                          emoji: event.target.value,
                        }))
                      }
                      placeholder="🤖"
                      className="h-9 rounded-md bg-[#161b22] border-[#30363d]"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-[#30363d] bg-[#161b22]/60 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#8b949e]">Provider presets</p>
                      <p className="mt-1 text-[11px] text-[#6e7681]">
                        Showing {visibleProviderPresets.length} of{" "}
                        {providerPresets.length}. Current provider models are
                        surfaced first.
                      </p>
                    </div>
                    {providerPresets.length > 10 && (
                      <button
                        type="button"
                        onClick={() =>
                          setShowAllProviderPresets(!showAllProviderPresets)
                        }
                        className="rounded-md border border-[#30363d] bg-[#0d1117] px-2.5 py-1.5 text-[11px] text-[#9da7b2] transition-colors hover:text-[#c9d1d9]"
                      >
                        {showAllProviderPresets
                          ? "Show less"
                          : `Show more (${providerPresets.length - visibleProviderPresets.length})`}
                      </button>
                    )}
                  </div>
                  <div
                    className={cn(
                      "flex flex-wrap gap-2",
                      showAllProviderPresets &&
                        "max-h-[340px] overflow-y-auto pr-1",
                    )}
                  >
                    {visibleProviderPresets.map((preset) => (
                      <button
                        key={`${preset.provider}-${preset.model}`}
                        type="button"
                        onClick={() =>
                          setAgentDraft((current) => ({
                            ...current,
                            provider: preset.provider,
                            model: preset.model,
                          }))
                        }
                        className={cn(
                          "max-w-full rounded-md border px-2.5 py-1.5 text-left text-[11px] transition-colors",
                          agentDraft.provider === preset.provider &&
                            agentDraft.model === preset.model
                            ? "border-[#58a6ff] bg-[#1f6feb]/20 text-[#79c0ff]"
                            : "border-[#30363d] bg-[#0d1117] text-[#9da7b2] hover:text-[#c9d1d9]",
                        )}
                      >
                        <span className="block break-words">
                          {preset.label} · {presetDisplayModel(preset)}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div>
                    <p className="mb-1 text-xs text-[#8b949e]">Provider</p>
                    <Select
                      value={agentDraft.provider}
                      onValueChange={(value) =>
                        setAgentDraft((current) => ({
                          ...current,
                          provider: value,
                        }))
                      }
                    >
                      <SelectTrigger className="h-9 rounded-md bg-[#161b22] border-[#30363d]">
                        <SelectValue placeholder="Provider" />
                      </SelectTrigger>
                      <SelectContent>
                        {Array.from(
                          new Set(
                            providerPresets.map((preset) => preset.provider),
                          ),
                        ).map((provider) => (
                          <SelectItem key={provider} value={provider}>
                            {provider}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-[#8b949e]">Model</p>
                    <Input
                      value={agentDraft.model}
                      onChange={(event) =>
                        setAgentDraft((current) => ({
                          ...current,
                          model: event.target.value,
                        }))
                      }
                      placeholder="gpt-4.1"
                      className="h-9 rounded-md bg-[#161b22] border-[#30363d]"
                    />
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <p className="mb-1 text-xs text-[#8b949e]">Objective</p>
                    <textarea
                      value={agentDraft.objective}
                      onChange={(event) =>
                        setAgentDraft((current) => ({
                          ...current,
                          objective: event.target.value,
                        }))
                      }
                      placeholder="What this agent should own."
                      className="min-h-[70px] w-full resize-none rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:ring-2 focus:ring-[#1f6feb]/35"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-[#8b949e]">System prompt</p>
                    <textarea
                      value={agentDraft.systemPrompt}
                      onChange={(event) =>
                        setAgentDraft((current) => ({
                          ...current,
                          systemPrompt: event.target.value,
                        }))
                      }
                      placeholder="You are a specialist agent..."
                      className="min-h-[90px] w-full resize-none rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:ring-2 focus:ring-[#1f6feb]/35"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <div className="md:col-span-2">
                    <p className="mb-1 text-xs text-[#8b949e]">
                      Workspace path
                    </p>
                    <Input
                      value={agentDraft.workspace}
                      onChange={(event) =>
                        setAgentDraft((current) => ({
                          ...current,
                          workspace: event.target.value,
                        }))
                      }
                      placeholder={DEFAULT_AGENT_WORKSPACE}
                      className="h-9 rounded-md bg-[#161b22] border-[#30363d]"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-[#8b949e]">Sandbox mode</p>
                    <Select
                      value={agentDraft.sandboxMode}
                      onValueChange={(value) =>
                        setAgentDraft((current) => ({
                          ...current,
                          sandboxMode: value as SandboxMode,
                        }))
                      }
                    >
                      <SelectTrigger className="h-9 rounded-md bg-[#161b22] border-[#30363d]">
                        <SelectValue placeholder="Sandbox mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="workspace-write">
                          workspace-write
                        </SelectItem>
                        <SelectItem value="read-only">read-only</SelectItem>
                        <SelectItem value="none">none</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs text-[#8b949e]">Permissions</p>
                  <div className="flex flex-wrap gap-2">
                    <PermissionToggle
                      icon={Terminal}
                      label="Terminal"
                      pressed={agentDraft.terminal}
                      onPressedChange={(pressed) =>
                        setAgentDraft((current) => ({
                          ...current,
                          terminal: pressed,
                        }))
                      }
                    />
                    <PermissionToggle
                      icon={Globe}
                      label="Browser"
                      pressed={agentDraft.browser}
                      onPressedChange={(pressed) =>
                        setAgentDraft((current) => ({
                          ...current,
                          browser: pressed,
                        }))
                      }
                    />
                    <PermissionToggle
                      icon={FolderOpen}
                      label="Files"
                      pressed={agentDraft.files}
                      onPressedChange={(pressed) =>
                        setAgentDraft((current) => ({
                          ...current,
                          files: pressed,
                        }))
                      }
                    />
                    <PermissionToggle
                      icon={ScrollText}
                      label="Git"
                      pressed={agentDraft.git}
                      onPressedChange={(pressed) =>
                        setAgentDraft((current) => ({
                          ...current,
                          git: pressed,
                        }))
                      }
                    />
                    <PermissionToggle
                      icon={Workflow}
                      label="Delegation"
                      pressed={agentDraft.delegation}
                      onPressedChange={(pressed) =>
                        setAgentDraft((current) => ({
                          ...current,
                          delegation: pressed,
                        }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-xs text-[#8b949e]">
                    Enabled tool surface
                  </p>
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {agentDraftCapabilityGroups.map((group) => (
                      <div
                        key={group.category}
                        className="rounded-md border border-[#30363d] bg-[#161b22]/70 p-3"
                      >
                        <div className="mb-2 flex items-center justify-between gap-3">
                          <span className="text-[12px] font-medium text-[#e6edf3]">
                            {group.label}
                          </span>
                          <span className="text-[10px] text-[#6e8398]">
                            {group.tools.length} tools
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {group.tools.map((tool) => (
                            <span
                              key={tool.name}
                              className="inline-flex rounded-full border border-white/8 bg-[#0d1117] px-2 py-0.5 text-[10px] text-[#9fb0c3]"
                            >
                              {tool.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-[#70849a]">
                    Browser mode currently covers web fetch and text extraction,
                    alongside generic HTTP requests. Terminal controls the
                    sandbox lane for real workspace execution.
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 justify-end gap-2 border-t border-[#30363d] px-6 py-4">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setIsCreateAgentOpen(false);
                    setEditingAgentId(null);
                    setAgentDraft(emptyAgentDraft);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="secondary" size="sm">
                  {editingAgentId ? "Save Changes" : "Create Agent"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog
          open={isCreateChannelOpen}
          onOpenChange={(open) => {
            if (!open) {
              setChannelDraft({
                title: "",
                objective: "",
                leadAgentId:
                  selectedAgent?.id ||
                  allAgents[0]?.id ||
                  DEFAULT_CHANNEL_LEAD_AGENT_ID,
                memberAgentIds: selectedAgent
                  ? [selectedAgent.id]
                  : [DEFAULT_CHANNEL_LEAD_AGENT_ID, "builder", "researcher"],
                memberTargets: {},
              });
            }
            setIsCreateChannelOpen(open);
          }}
        >
          <DialogContent className="max-w-2xl border border-[#30363d] bg-[#0d1117] text-[#c9d1d9]">
            <DialogHeader>
              <DialogTitle className="text-[#e6edf3]">
                Create Channel
              </DialogTitle>
              <DialogDescription className="text-[#8b949e]">
                Create a Nebula-style shared task room where a lead agent can
                delegate and the collaborators can report back in the same
                thread.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                handleCreateChannel();
              }}
              className="space-y-4"
            >
              <div>
                <p className="mb-1 text-xs text-[#8b949e]">Channel title</p>
                <Input
                  value={channelDraft.title}
                  onChange={(event) =>
                    setChannelDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Landing page redesign"
                  className="h-9 rounded-md border-[#30363d] bg-[#161b22]"
                />
              </div>

              <div>
                <p className="mb-1 text-xs text-[#8b949e]">Shared objective</p>
                <textarea
                  value={channelDraft.objective}
                  onChange={(event) =>
                    setChannelDraft((current) => ({
                      ...current,
                      objective: event.target.value,
                    }))
                  }
                  placeholder="Coordinate research, implementation, and QA around one goal."
                  className="min-h-[100px] w-full resize-none rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:ring-2 focus:ring-[#1f6feb]/35"
                />
              </div>

              <div>
                <p className="mb-1 text-xs text-[#8b949e]">Lead agent</p>
                <Select
                  value={channelDraft.leadAgentId}
                  onValueChange={(value) =>
                    setChannelDraft((current) => ({
                      ...current,
                      leadAgentId: value,
                      memberAgentIds: uniqueStrings([
                        value,
                        ...current.memberAgentIds,
                      ]),
                      memberTargets: {
                        ...current.memberTargets,
                        [value]: current.memberTargets[value] || "",
                      },
                    }))
                  }
                >
                  <SelectTrigger className="h-9 rounded-md border-[#30363d] bg-[#161b22]">
                    <SelectValue placeholder="Select lead agent" />
                  </SelectTrigger>
                  <SelectContent>
                    {allAgents.map((agent) => (
                      <SelectItem key={agent.id} value={agent.id}>
                        {agent.emoji} {agent.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <p className="mb-2 text-xs text-[#8b949e]">Channel members</p>
                <div className="flex flex-wrap gap-2">
                  {allAgents.map((agent) => {
                    const active = channelDraft.memberAgentIds.includes(
                      agent.id,
                    );
                    return (
                      <button
                        key={agent.id}
                        type="button"
                        onClick={() => toggleChannelDraftMember(agent.id)}
                        className={cn(
                          "rounded-md border px-3 py-2 text-[12px] transition-colors",
                          active
                            ? "border-[#58a6ff] bg-[#1f6feb]/20 text-[#79c0ff]"
                            : "border-[#30363d] bg-[#161b22] text-[#9da7b2] hover:text-[#c9d1d9]",
                        )}
                      >
                        {agent.emoji} {agent.name}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs text-[#8b949e]">Per-agent targets</p>
                <div className="space-y-2">
                  {channelDraft.memberAgentIds.map((memberId) => {
                    const member = allAgents.find(
                      (agent) => agent.id === memberId,
                    );
                    if (!member) {
                      return null;
                    }

                    return (
                      <div
                        key={member.id}
                        className="rounded-md border border-[#30363d] bg-[#161b22]/70 p-3"
                      >
                        <div className="mb-2 flex items-center gap-2 text-[12px] text-[#c9d1d9]">
                          <span>{member.emoji}</span>
                          <span className="font-medium">{member.name}</span>
                          {channelDraft.leadAgentId === member.id && (
                            <Badge variant="cyan">Lead</Badge>
                          )}
                        </div>
                        <textarea
                          value={channelDraft.memberTargets[member.id] || ""}
                          onChange={(event) =>
                            updateChannelDraftMemberTarget(
                              member.id,
                              event.target.value,
                            )
                          }
                          placeholder={`What should ${member.name} own in this room?`}
                          className="min-h-[68px] w-full resize-none rounded-md border border-[#30363d] bg-[#0d1117] px-3 py-2 text-sm text-[#e6edf3] placeholder-[#6e7681] focus:outline-none focus:ring-2 focus:ring-[#1f6feb]/35"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsCreateChannelOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="secondary" size="sm">
                  Create Channel
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={isDelegationOpen} onOpenChange={setIsDelegationOpen}>
          <DialogContent className="max-w-2xl border border-[#30363d] bg-[#0d1117] text-[#c9d1d9]">
            <DialogHeader>
              <DialogTitle className="text-[#e6edf3]">
                Create Delegation
              </DialogTitle>
              <DialogDescription className="text-[#8b949e]">
                Assign work to a specialist and choose how it should execute.
              </DialogDescription>
            </DialogHeader>

            <form
              onSubmit={(event) => {
                event.preventDefault();
                void handleCreateDelegation();
              }}
              className="space-y-4"
            >
              <div>
                <p className="mb-1 text-xs text-[#8b949e]">Title</p>
                <Input
                  value={delegationDraft.title}
                  onChange={(event) =>
                    setDelegationDraft((current) => ({
                      ...current,
                      title: event.target.value,
                    }))
                  }
                  placeholder="Review release risk before deploy"
                  className="h-9 rounded-md bg-[#161b22] border-[#30363d]"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-2">
                  <p className="mb-1 text-xs text-[#8b949e]">Assignee</p>
                  <Select
                    value={delegationDraft.assigneeId}
                    onValueChange={(value) =>
                      setDelegationDraft((current) => ({
                        ...current,
                        assigneeId: value,
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 rounded-md bg-[#161b22] border-[#30363d]">
                      <SelectValue placeholder="Select assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      {allAgents.map((agent) => (
                        <SelectItem key={agent.id} value={agent.id}>
                          {agent.emoji} {agent.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-xs text-[#8b949e]">Priority</p>
                  <Select
                    value={delegationDraft.priority}
                    onValueChange={(value) =>
                      setDelegationDraft((current) => ({
                        ...current,
                        priority: value as DelegationPriority,
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 rounded-md bg-[#161b22] border-[#30363d]">
                      <SelectValue placeholder="Priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">low</SelectItem>
                      <SelectItem value="medium">medium</SelectItem>
                      <SelectItem value="high">high</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-xs text-[#8b949e]">Execution mode</p>
                  <Select
                    value={delegationDraft.executionMode}
                    onValueChange={(value) =>
                      setDelegationDraft((current) => ({
                        ...current,
                        executionMode: value as DelegationExecutionMode,
                      }))
                    }
                  >
                    <SelectTrigger className="h-9 rounded-md bg-[#161b22] border-[#30363d]">
                      <SelectValue placeholder="Execution mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="thread">thread</SelectItem>
                      <SelectItem value="command">command</SelectItem>
                      <SelectItem value="manual">manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <p className="mb-1 text-xs text-[#8b949e]">
                    Command CWD (optional)
                  </p>
                  <Input
                    value={delegationDraft.cwd}
                    onChange={(event) =>
                      setDelegationDraft((current) => ({
                        ...current,
                        cwd: event.target.value,
                      }))
                    }
                    placeholder={DEFAULT_AGENT_WORKSPACE}
                    className="h-9 rounded-md bg-[#161b22] border-[#30363d]"
                  />
                </div>
              </div>

              <div>
                <p className="mb-1 text-xs text-[#8b949e]">
                  {delegationDraft.executionMode === "command"
                    ? "Command payload"
                    : "Instruction payload"}
                </p>
                <textarea
                  value={delegationDraft.payload}
                  onChange={(event) =>
                    setDelegationDraft((current) => ({
                      ...current,
                      payload: event.target.value,
                    }))
                  }
                  placeholder={
                    delegationDraft.executionMode === "command"
                      ? "npm run build"
                      : "Take ownership of this task and report next steps."
                  }
                  className="w-full rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-[#e6edf3] placeholder-[#6e7681] min-h-[90px] resize-none focus:outline-none focus:ring-2 focus:ring-[#1f6feb]/35"
                />
              </div>

              <div>
                <p className="mb-1 text-xs text-[#8b949e]">Notes (optional)</p>
                <textarea
                  value={delegationDraft.notes}
                  onChange={(event) =>
                    setDelegationDraft((current) => ({
                      ...current,
                      notes: event.target.value,
                    }))
                  }
                  placeholder="Any context or constraints"
                  className="w-full rounded-md border border-[#30363d] bg-[#161b22] px-3 py-2 text-sm text-[#e6edf3] placeholder-[#6e7681] min-h-[70px] resize-none focus:outline-none focus:ring-2 focus:ring-[#1f6feb]/35"
                />
              </div>

              <div className="flex items-center justify-between rounded-md border border-[#30363d] bg-[#161b22]/65 px-3 py-2">
                <div>
                  <p className="text-sm text-[#c9d1d9]">
                    Auto-dispatch immediately
                  </p>
                  <p className="text-xs text-[#8b949e]">
                    Run the task as soon as it is created.
                  </p>
                </div>
                <Toggle
                  pressed={delegationDraft.autoDispatch}
                  onPressedChange={(pressed) =>
                    setDelegationDraft((current) => ({
                      ...current,
                      autoDispatch: pressed,
                    }))
                  }
                >
                  {delegationDraft.autoDispatch ? "ON" : "OFF"}
                </Toggle>
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsDelegationOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="secondary" size="sm">
                  Create Delegation
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        {/* Dummy unused handlers to satisfy TypeScript */}
        <div className="hidden">
          {String(isCreateAgentOpen) +
            String(isDelegationOpen) +
            String(activeDelegationCount) +
            String(terminalReadyCount) +
            String(workspaceActivity)}
          {String(commandDraft) +
            String(commandCwdDraft) +
            String(isExecutingCommand) +
            String(commandError) +
            String(isProcessingCommandApproval)}
          {String(workspaceSyncError) +
            String(orchestrationSyncError) +
            String(workspaceView) +
            String(providerPresets.length)}
          {String(toolInvocationResults.length)}
        </div>

        <Dialog
          open={toolApproval !== null}
          onOpenChange={(open) => {
            if (!open) setToolApproval(null);
          }}
        >
          <DialogContent className="max-w-2xl border border-[#30363d] bg-[#0d1117] text-[#c9d1d9]">
            <DialogHeader>
              <DialogTitle className="text-[#e6edf3] flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#f59e0b]" />
                Tool Approval Required
              </DialogTitle>
              <DialogDescription className="text-[#8b949e]">
                {toolApproval?.request.agentName ?? "An agent"} wants to run{" "}
                <code className="rounded bg-[#161b22] px-1.5 py-0.5 text-[#79c0ff]">
                  {toolApproval?.request.tool ?? "unknown"}
                </code>
                . Review the details below before approving.
              </DialogDescription>
            </DialogHeader>

            {toolApproval && (
              <div className="space-y-4">
                <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Badge
                      variant={
                        toolApproval.request.riskLevel === "critical" ||
                        toolApproval.request.riskLevel === "high"
                          ? "danger"
                          : toolApproval.request.riskLevel === "medium"
                            ? "amber"
                            : "cyan"
                      }
                    >
                      {toolApproval.request.riskLevel} risk
                    </Badge>
                    <span className="text-[12px] text-[#8b949e]">
                      {toolApproval.request.tool}
                    </span>
                  </div>

                  {toolApproval.request.reasons.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                        Reasons for approval:
                      </p>
                      {toolApproval.request.reasons.map((reason, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 text-[13px] text-[#fcd34d]"
                        >
                          <span className="mt-1">•</span>
                          <span>{reason}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {toolApproval.request.preview?.command && (
                  <div className="rounded-lg border border-[#30363d] bg-[#0b0f15] p-3">
                    <p className="text-[11px] uppercase tracking-wider text-[#8b949e] mb-2">
                      Command Preview
                    </p>
                    <pre className="font-mono text-[12px] text-[#10b981] whitespace-pre-wrap">
                      $ {toolApproval.request.preview.command}
                    </pre>
                  </div>
                )}

                {toolApproval.request.preview?.diff && (
                  <div className="rounded-lg border border-[#30363d] bg-[#0b0f15] overflow-hidden">
                    <div className="px-3 py-2 border-b border-[#1e252e] text-[11px] text-[#8b949e]">
                      Diff Preview
                    </div>
                    <pre className="p-3 font-mono text-[12px] whitespace-pre-wrap overflow-auto max-h-[200px]">
                      {toolApproval.request.preview.diff}
                    </pre>
                  </div>
                )}

                {toolApproval.request.preview?.filePaths &&
                  toolApproval.request.preview.filePaths.length > 0 && (
                    <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3">
                      <p className="text-[11px] uppercase tracking-wider text-[#8b949e] mb-2">
                        Files Affected
                      </p>
                      {toolApproval.request.preview.filePaths.map((fp, i) => (
                        <div
                          key={i}
                          className="flex items-center gap-2 text-[13px] text-[#c9d1d9]"
                        >
                          <FolderOpen className="h-3.5 w-3.5 text-[#8b949e]" />
                          <code className="text-[#79c0ff]">{fp}</code>
                        </div>
                      ))}
                    </div>
                  )}

                {toolApproval.request.preview?.url && (
                  <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3">
                    <p className="text-[11px] uppercase tracking-wider text-[#8b949e] mb-2">
                      External Request ·{" "}
                      {toolApproval.request.preview.method || "GET"}
                    </p>
                    <code className="text-[13px] text-[#79c0ff] break-all">
                      {toolApproval.request.preview.url}
                    </code>
                  </div>
                )}

                <div className="rounded-lg border border-[#30363d] bg-[#161b22] p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[11px] uppercase tracking-wider text-[#8b949e]">
                      Parameters
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px]"
                      onClick={() =>
                        setToolApproval((current) =>
                          current
                            ? { ...current, editMode: !current.editMode }
                            : current,
                        )
                      }
                    >
                      {toolApproval.editMode ? "Cancel Edit" : "Edit Params"}
                    </Button>
                  </div>
                  {toolApproval.editMode ? (
                    <textarea
                      value={JSON.stringify(
                        toolApproval.editedParameters,
                        null,
                        2,
                      )}
                      onChange={(e) => {
                        try {
                          const parsed = JSON.parse(e.target.value);
                          setToolApproval((current) =>
                            current
                              ? { ...current, editedParameters: parsed }
                              : current,
                          );
                        } catch {}
                      }}
                      className="w-full rounded-md border border-[#30363d] bg-[#0b0f15] px-3 py-2 font-mono text-[12px] text-[#e6edf3] min-h-[100px] resize-y focus:outline-none focus:ring-2 focus:ring-[#1f6feb]/35"
                    />
                  ) : (
                    <pre className="font-mono text-[12px] text-[#c9d1d9] whitespace-pre-wrap overflow-auto max-h-[200px]">
                      {JSON.stringify(toolApproval.request.parameters, null, 2)}
                    </pre>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleToolApprovalAction("reject")}
                    disabled={toolApproval.isResolving}
                    className="text-[#f87171] hover:text-[#fca5a5] hover:bg-[#3f191f]/30"
                  >
                    Reject
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => void handleToolApprovalAction("approve")}
                    disabled={toolApproval.isResolving}
                  >
                    {toolApproval.isResolving ? "Approving..." : "Approve"}
                  </Button>
                  {toolApproval.editMode && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleToolApprovalAction("edit")}
                      disabled={toolApproval.isResolving}
                    >
                      {toolApproval.isResolving
                        ? "Applying..."
                        : "Apply Edit & Approve"}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <CommandApprovalModal
          pendingCommandApproval={pendingCommandApproval}
          isProcessingCommandApproval={isProcessingCommandApproval}
          pendingApprovalAgent={pendingApprovalAgent ?? undefined}
          handleCancelCommandApproval={handleCancelCommandApproval}
          handleApproveCommandApproval={handleApproveCommandApproval as any}
        />
        <PlanReviewModal
          review={activePlanReview}
          open={Boolean(activePlanReview)}
          onApprove={handleApprovePlanReview}
          onReject={handleRejectPlanReview}
        />
        <AgentCreatorModal onConfirm={handleCreateAgentFromBlueprint} />
        <AnimatePresence>
          {activityToast && (
            <motion.button
              key="activity-toast"
              initial={{ y: 20, opacity: 0, scale: 0.96 }}
              animate={{ y: 0, opacity: 1, scale: 1, transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] } }}
              exit={{ y: 10, opacity: 0, scale: 0.96, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] } }}
              onClick={() => {
                setActivityDrawerTab("activity");
                setIsActivityDrawerOpen(true);
                setActivityToast(null);
              }}
              className="absolute bottom-[100px] right-8 z-50 flex items-center gap-2 rounded-full border border-white/12 bg-[linear-gradient(180deg,rgba(30,41,59,0.96),rgba(15,23,42,0.92))] px-3 py-1.5 shadow-[0_8px_32px_rgba(0,0,0,0.3)] backdrop-blur-xl transition-all hover:bg-white/[0.08]"
            >
              <div className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#0ea5e9] shadow-[0_0_8px_rgba(14,165,233,0.8)]" />
              <span className="text-[11px] font-medium text-[#edf4f8] whitespace-nowrap">New activity</span>
              <span className="max-w-[140px] truncate text-[11px] text-[#8ea0b5]">
                {activityToast.label}
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </main>

      <ActivityDrawer legacyProps={activityDrawerLegacyProps} />
      {!isActivityDrawerOpen ? (
        <button
          type="button"
          onClick={() => setIsActivityDrawerOpen(true)}
          className="fixed right-4 top-24 z-40 hidden xl:inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(18,26,37,0.96),rgba(12,18,27,0.92))] px-3 py-2 text-[12px] font-medium text-[#c9d1d9] shadow-[0_8px_28px_rgba(0,0,0,0.34)] backdrop-blur-xl transition-all hover:border-white/16 hover:bg-white/[0.08] hover:text-[#e6edf3]"
          aria-label="Open activity rail"
        >
          <ChevronLeft className="h-4 w-4" />
          Activity
        </button>
      ) : null}

      {/* Global Command Palette (Cmd+K) */}
      <CommandPalette
        agents={allAgents}
        channels={channels}
        onSelectAgent={(id) => setSelectedAgentId(id)}
        onSelectChannel={(id) => {
          setSelectedChannelId(id);
          setWorkspaceView("channels");
        }}
      />

    </div>
  );
}

function DataModeBadge({ dataMode }: { dataMode: CommandCenterDataMode }) {
  if (dataMode === "live") {
    return <Badge variant="emerald">Live Sync</Badge>;
  }

  if (dataMode === "connecting") {
    return <Badge variant="cyan">Connecting</Badge>;
  }

  if (dataMode === "fallback") {
    return <Badge variant="amber">Fallback</Badge>;
  }

  return <Badge variant="muted">Local Mode</Badge>;
}

function WorkspaceSyncBadge({
  mode,
}: {
  mode: "local" | "syncing" | "live" | "fallback";
}) {
  if (mode === "live") {
    return <Badge variant="emerald">Workspace Saved</Badge>;
  }

  if (mode === "syncing") {
    return <Badge variant="cyan">Workspace Syncing</Badge>;
  }

  if (mode === "fallback") {
    return <Badge variant="amber">Workspace Fallback</Badge>;
  }

  return <Badge variant="muted">Workspace Local</Badge>;
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Bot;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#181c20]/90 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-mutedText">
            {label}
          </p>
          <p className="font-display mt-3 text-3xl font-semibold tracking-tight text-foreground">
            {value}
          </p>
          <p className="mt-2 max-w-[180px] text-sm text-secondaryText">
            {hint}
          </p>
        </div>
        <div className="rounded-2xl border border-white/12 bg-white/[0.04] p-3">
          <Icon className="h-5 w-5 text-primary" />
        </div>
      </div>
    </div>
  );
}

function PanelLabel({
  title,
  icon: Icon,
}: {
  title: string;
  icon: typeof Bot;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="font-display text-xs font-semibold uppercase tracking-[0.22em] text-mutedText">
          {title}
        </p>
      </div>
      <Icon className="h-4 w-4 text-primary" />
    </div>
  );
}

function PermissionToggle({
  icon: Icon,
  label,
  pressed,
  onPressedChange,
}: {
  icon: typeof Bot;
  label: string;
  pressed: boolean;
  onPressedChange: (pressed: boolean) => void;
}) {
  return (
    <Toggle
      pressed={pressed}
      onPressedChange={onPressedChange}
      className="gap-2"
    >
      <Icon className="h-4 w-4" />
      {label}
    </Toggle>
  );
}

export default App;
