/**
 * Core types for the Control Room workspace.
 * Extracted from App.tsx to enable reuse across all modules.
 */
import type { Agent, AgentStatus } from "@/data/mock-data";
import type { RuntimeArtifact } from "@/lib/agent-runtime";
import type { ToolApprovalRequest } from "@/lib/tool-definitions";
import type { Database } from "@/lib/supabase-types";

// ── Scalar union types ───────────────────────────────────────────────

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
export type AgentAutomationKey =
  | "manual"
  | "schedule"
  | "webhook"
  | "repoEvents"
  | "inbox";
export type AgentConnectorKey =
  | "localBridge"
  | "browser"
  | "composio"
  | "github"
  | "gmail"
  | "googleDrive"
  | "googleCalendar"
  | "slack"
  | "notion"
  | "vercel"
  | "supabase"
  | "webhook";
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

// ── Interfaces ───────────────────────────────────────────────────────

export interface AgentPermissions {
  terminal: boolean;
  browser: boolean;
  files: boolean;
  git: boolean;
  delegation: boolean;
  automations?: Record<AgentAutomationKey, boolean>;
  connectors?: Record<AgentConnectorKey, boolean>;
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

export interface BridgeCommandRow {
  id: string;
  status: "pending" | "dispatched" | "running" | "completed" | "failed" | "canceled";
  result?: {
    exitCode?: number;
    stdout?: string;
    stderr?: string;
    timedOut?: boolean;
    durationMs?: number;
    cwd?: string;
    error?: string;
    artifacts?: RuntimeArtifact[] | null;
  } | null;
  updated_at?: string;
}

export type CommandExecutionRequestResult =
  | { status: "completed"; result: import("@/lib/agent-runtime").RuntimeExecuteResult }
  | { status: "queued"; result: import("@/lib/agent-runtime").RuntimeExecuteResult }
  | { status: "waiting_for_approval" }
  | { status: "blocked" };

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
  automations: Record<AgentAutomationKey, boolean>;
  connectors: Record<AgentConnectorKey, boolean>;
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

// ── Supabase row types ───────────────────────────────────────────────

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
