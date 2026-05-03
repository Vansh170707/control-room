/**
 * Constants, metadata maps, and configuration shared across the Control Room.
 * Extracted from App.tsx lines 526-1301.
 */
import {
  Activity,
  Bot,
  CalendarDays,
  Clock3,
  Cloud,
  Database as DatabaseIcon,
  FileText,
  FolderOpen,
  Github,
  GitPullRequest,
  Globe,
  Inbox,
  Key,
  Link2,
  Mail,
  MessageCircle,
  PlayCircle,
  PlugZap,
  Radio,
  ScrollText,
  Slack,
  Terminal,
  Users2,
  Workflow,
} from "lucide-react";
import type { AgentStatus } from "@/data/mock-data";
import { NVIDIA_MODEL_PRESETS } from "@/lib/nvidia-models";
import type {
  AgentAutomationKey,
  AgentConnectorKey,
  AgentDraft,
  ChannelDraft,
  DelegationExecutionMode,
  DelegationPriority,
  DelegationStatus,
  ChannelStatus,
  PermissionKey,
  SandboxMode,
  WorkspaceView,
} from "@/types";


// ── Storage keys ─────────────────────────────────────────────────────

export const STORAGE_KEYS = {
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

export const PERSONAL_WORKSPACE_ID = "default";
export const CONVERSATION_RESET_VERSION = "2026-04-27-fresh-agent-chats";
export const STORAGE_MAINTENANCE_VERSION = "2026-04-27-fresh-agent-chats";

// ── Command security ─────────────────────────────────────────────────

export const blockedCommandPatterns = [
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

export const readOnlyCommands = new Set([
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

export const shellRiskPattern = /[|;&><`$]/;
export const TRUSTED_PERSONAL_TERMINAL_ACCESS = true;

export const commandApprovalPatterns = [
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

// ── Visual metadata maps ─────────────────────────────────────────────

export const accentPalette = [
  "#10b981",
  "#38bdf8",
  "#f59e0b",
  "#fb7185",
  "#818cf8",
  "#14b8a6",
];

export const statusMeta: Record<
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

export const runStatusMeta: Record<
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

export const delegationMeta: Record<
  DelegationStatus,
  { label: string; badgeVariant: "cyan" | "emerald" | "amber" | "muted" }
> = {
  queued: { label: "Queued", badgeVariant: "cyan" },
  active: { label: "Active", badgeVariant: "emerald" },
  blocked: { label: "Blocked", badgeVariant: "amber" },
  done: { label: "Done", badgeVariant: "muted" },
};

export const channelMeta: Record<
  ChannelStatus,
  { label: string; badgeVariant: "emerald" | "amber" | "muted" }
> = {
  active: { label: "Active", badgeVariant: "emerald" },
  blocked: { label: "Blocked", badgeVariant: "amber" },
  done: { label: "Done", badgeVariant: "muted" },
};

export const priorityMeta: Record<
  DelegationPriority,
  { label: string; badgeVariant: "muted" | "cyan" | "danger" }
> = {
  low: { label: "Low", badgeVariant: "muted" },
  medium: { label: "Medium", badgeVariant: "cyan" },
  high: { label: "High", badgeVariant: "danger" },
};

export const executionModeMeta: Record<
  DelegationExecutionMode,
  { label: string; badgeVariant: "muted" | "cyan" | "amber" }
> = {
  manual: { label: "Manual", badgeVariant: "muted" },
  thread: { label: "Thread", badgeVariant: "cyan" },
  command: { label: "Command", badgeVariant: "amber" },
};

// ── Navigation ───────────────────────────────────────────────────────

export const viewItems: Array<{
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

// ── Workspace defaults ───────────────────────────────────────────────

export const DEFAULT_AGENT_WORKSPACE = "/Users/vanshsehrawat";
export const CLOUD_BRIDGE_AGENT_ID =
  import.meta.env.VITE_CLOUD_BRIDGE_AGENT_ID?.trim() || "alpha";
export const CLOUD_BRIDGE_INGEST_SECRET =
  import.meta.env.VITE_CLOUD_BRIDGE_INGEST_SECRET?.trim() || "";
export const CLOUD_BRIDGE_SECRET_STORAGE_KEY = "clawbuddy-ingest-secret";
export const CONTROL_ROOM_ROOT = "/Users/vanshsehrawat/Desktop/control room";
export const PDF_RESUME_GENERATOR_PATH = `${CONTROL_ROOM_ROOT}/scripts/generate_resume_pdf.py`;

export const LEGACY_DEFAULT_WORKSPACES = new Set([
  "/workspace/control-room",
  "/Users/vanshsehrawat/Desktop/control room",
]);

export const isLocalBrowserOrigin = () => {
  if (typeof window === "undefined") {
    return false;
  }
  return ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
};

// ── Agent identity IDs ───────────────────────────────────────────────

export const GALAXY_AGENT_ID = "galaxy";
export const DEFAULT_CHANNEL_LEAD_AGENT_ID = GALAXY_AGENT_ID;
export const BUILDER_AGENT_ID = "builder";
export const STALE_IN_FLIGHT_RUN_MS = 30 * 60 * 1000;

// ── Built-in skill catalog ───────────────────────────────────────────

export const builtInSkillCatalog: Array<{
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

// ── Automation & connector defaults ──────────────────────────────────

export const defaultAutomationOptions: Record<AgentAutomationKey, boolean> = {
  manual: true,
  schedule: false,
  webhook: false,
  repoEvents: false,
  inbox: false,
};

export const defaultAgentConnectors: Record<AgentConnectorKey, boolean> = {
  localBridge: true,
  browser: true,
  composio: false,
  github: false,
  gmail: false,
  googleDrive: false,
  googleCalendar: false,
  slack: false,
  notion: false,
  vercel: false,
  supabase: false,
  webhook: false,
};

export const automationOptionCatalog: Array<{
  key: AgentAutomationKey;
  label: string;
  description: string;
  icon: typeof Bot;
}> = [
  {
    key: "manual",
    label: "Manual Runs",
    description: "Run this agent on demand from chat, channels, or the activity deck.",
    icon: PlayCircle,
  },
  {
    key: "schedule",
    label: "Schedules",
    description: "Allow recurring checks such as daily briefs, hourly scans, and reminders.",
    icon: CalendarDays,
  },
  {
    key: "webhook",
    label: "Webhooks",
    description: "Let external apps trigger the agent through runtime webhook entrypoints.",
    icon: Radio,
  },
  {
    key: "repoEvents",
    label: "Repo Events",
    description: "Wake the agent for pushes, PRs, review loops, and CI status changes.",
    icon: GitPullRequest,
  },
  {
    key: "inbox",
    label: "Inbox Watch",
    description: "Reserve this agent for email, calendar, Slack, or notification-driven tasks.",
    icon: Inbox,
  },
];

export const connectorCatalog: Array<{
  key: AgentConnectorKey;
  label: string;
  description: string;
  icon: typeof Bot;
  automationKey?: AgentAutomationKey;
  permissionKeys?: PermissionKey[];
}> = [
  {
    key: "localBridge",
    label: "Local Bridge",
    description: "Files, terminal, dependency installs, downloads, and workspace command execution.",
    icon: Terminal,
    permissionKeys: ["terminal", "files"],
  },
  {
    key: "browser",
    label: "Browser Use",
    description: "Navigate, click, type, read pages, and return browser workflow results.",
    icon: Globe,
    permissionKeys: ["browser"],
  },
  {
    key: "composio",
    label: "Composio",
    description: "Managed OAuth and tool access for app connectors, Nebula-style.",
    icon: PlugZap,
    permissionKeys: ["browser"],
  },
  {
    key: "github",
    label: "GitHub",
    description: "Repositories, issues, PRs, Copilot/GitHub model auth, and Composio repo tools.",
    icon: Github,
    automationKey: "repoEvents",
    permissionKeys: ["git", "browser"],
  },
  {
    key: "gmail",
    label: "Gmail",
    description: "Email reading, drafting, summaries, follow-ups, and inbox-triggered workflows.",
    icon: Mail,
    automationKey: "inbox",
    permissionKeys: ["browser"],
  },
  {
    key: "googleDrive",
    label: "Google Drive",
    description: "Docs, PDFs, spreadsheets, shared files, and file-driven knowledge work.",
    icon: Cloud,
    permissionKeys: ["browser", "files"],
  },
  {
    key: "googleCalendar",
    label: "Calendar",
    description: "Schedule-aware reminders, event prep, meeting briefs, and planning follow-ups.",
    icon: CalendarDays,
    automationKey: "schedule",
    permissionKeys: ["browser"],
  },
  {
    key: "slack",
    label: "Slack",
    description: "Team/channel messages, alerts, summaries, and response drafting.",
    icon: Slack,
    automationKey: "inbox",
    permissionKeys: ["browser"],
  },
  {
    key: "notion",
    label: "Notion",
    description: "Workspace notes, task databases, research logs, and planning pages.",
    icon: FileText,
    permissionKeys: ["browser"],
  },
  {
    key: "vercel",
    label: "Vercel",
    description: "Deployments, logs, domains, environment variables, and production checks.",
    icon: Cloud,
    permissionKeys: ["terminal", "browser"],
  },
  {
    key: "supabase",
    label: "Supabase",
    description: "Database-backed memory, realtime workspace state, and agent persistence.",
    icon: DatabaseIcon,
    permissionKeys: ["browser"],
  },
  {
    key: "webhook",
    label: "Custom Webhook",
    description: "Generic HTTP connector for app-specific triggers and service callbacks.",
    icon: Link2,
    automationKey: "webhook",
    permissionKeys: ["browser"],
  },
];

export const composioManagedConnectorKeys = new Set<AgentConnectorKey>([
  "github",
  "gmail",
  "googleDrive",
  "googleCalendar",
  "slack",
  "notion",
  "vercel",
]);

// ── Provider presets ─────────────────────────────────────────────────

export const providerPresets = [
  { label: "OpenAI", provider: "OpenAI", model: "gpt-4.1" },
  { label: "Anthropic", provider: "Anthropic", model: "claude-3-7-sonnet" },
  {
    label: "Gemini",
    provider: "Gemini",
    model: "gemini-2.5-flash",
    displayModel: "Gemini 2.5 Flash",
  },
  {
    label: "Gemini",
    provider: "Gemini",
    model: "gemini-2.5-pro",
    displayModel: "Gemini 2.5 Pro",
  },
  {
    label: "Gemini",
    provider: "Gemini",
    model: "gemini-3-flash-preview",
    displayModel: "Gemini 3 Flash Preview",
  },
  {
    label: "Gemini",
    provider: "Gemini",
    model: "gemini-3.1-pro-preview",
    displayModel: "Gemini 3.1 Pro Preview",
  },
  { label: "Groq", provider: "Groq", model: "llama-3.3-70b-versatile" },
  {
    label: "OpenRouter",
    provider: "OpenRouter",
    model: "google/gemini-2.5-pro",
  },
  { label: "GitHub Models", provider: "GitHub", model: "openai/gpt-4.1" },
  ...NVIDIA_MODEL_PRESETS,
  {
    label: "Modal",
    provider: "Modal",
    model: "zai-org/GLM-5.1-FP8",
    displayModel: "GLM 5.1",
  },
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

// ── Empty drafts ─────────────────────────────────────────────────────

export const emptyAgentDraft: AgentDraft = {
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
  automations: { ...defaultAutomationOptions },
  connectors: { ...defaultAgentConnectors },
};

export const emptyChannelDraft: ChannelDraft = {
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
