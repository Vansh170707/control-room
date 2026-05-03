/**
 * Supabase row mappers, normalizers, and merge utilities.
 * Extracted from App.tsx lines 1504-2320.
 */
import type { AgentStatus } from "@/data/mock-data";
import type { RuntimeCommandRunRecord } from "@/lib/agent-runtime";
import type { Json } from "@/lib/supabase-types";
import type {
  ContextPackage,
  DispatcherDecision,
  KnowledgeGraph,
  PlanReviewRequest,
  TaskTree,
  ToolDraft,
  VerifierReview,
  CircuitBreakerEvent,
} from "@/lib/orchestration";
import {
  BUILDER_AGENT_ID,
  DEFAULT_CHANNEL_LEAD_AGENT_ID,
  LEGACY_DEFAULT_WORKSPACES,
  DEFAULT_AGENT_WORKSPACE,
  defaultAutomationOptions,
  defaultAgentConnectors,
  connectorCatalog,
  automationOptionCatalog,
} from "@/constants";
import { codexStyleBuilderDefaults, defaultCustomAgents } from "@/data/default-agents";
import type {
  AgentAutomationKey,
  AgentConnectorKey,
  AgentPermissions,
  ChannelMessage,
  ChatMessage,
  CollaborationChannel,
  CommandRun,
  DelegationTask,
  SandboxMode,
  WorkspaceAgent,
  WorkspaceAgentRow,
  WorkspaceCommandRunRow,
  WorkspaceContextPackageRow,
  WorkspaceCircuitBreakerEventRow,
  WorkspaceDelegationRow,
  WorkspaceDispatcherDecisionRow,
  WorkspaceKnowledgeGraphRow,
  WorkspaceMessageRow,
  WorkspacePlanReviewRow,
  WorkspaceTaskTreeRow,
  WorkspaceToolDraftRow,
  WorkspaceVerifierReviewRow,
  ActivityKind,
} from "@/types";

// ── Small utilities used by multiple mappers ─────────────────────────

export function uniqueStrings(values: string[]) {
  return Array.from(new Set(values));
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

export function parseList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function resolveWorkspacePath(
  workspace: string | null | undefined,
  fallback = DEFAULT_AGENT_WORKSPACE,
) {
  const trimmed = (workspace ?? "").trim();
  return !trimmed || LEGACY_DEFAULT_WORKSPACES.has(trimmed)
    ? fallback
    : trimmed;
}

// ── Permission normalizers ───────────────────────────────────────────

export function normalizeAutomationOptions(
  value: unknown,
): Record<AgentAutomationKey, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...defaultAutomationOptions };
  }
  const source = value as Record<string, unknown>;
  return {
    manual: source.manual === undefined ? true : Boolean(source.manual),
    schedule: Boolean(source.schedule),
    webhook: Boolean(source.webhook),
    repoEvents: Boolean(source.repoEvents),
    inbox: Boolean(source.inbox),
  };
}

export function normalizeAgentConnectors(
  value: unknown,
): Record<AgentConnectorKey, boolean> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...defaultAgentConnectors };
  }
  const source = value as Record<string, unknown>;
  return {
    localBridge: source.localBridge === undefined ? true : Boolean(source.localBridge),
    browser: source.browser === undefined ? true : Boolean(source.browser),
    composio: Boolean(source.composio),
    github: Boolean(source.github),
    gmail: Boolean(source.gmail),
    googleDrive: Boolean(source.googleDrive),
    googleCalendar: Boolean(source.googleCalendar),
    slack: Boolean(source.slack),
    notion: Boolean(source.notion),
    vercel: Boolean(source.vercel),
    supabase: Boolean(source.supabase),
    webhook: Boolean(source.webhook),
  };
}

export function asAgentPermissions(value: unknown): AgentPermissions {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      terminal: false, browser: false, files: false, git: false, delegation: false,
      automations: { ...defaultAutomationOptions },
      connectors: { ...defaultAgentConnectors },
    };
  }
  const source = value as Record<string, unknown>;
  return {
    terminal: Boolean(source.terminal),
    browser: Boolean(source.browser),
    files: Boolean(source.files),
    git: Boolean(source.git),
    delegation: Boolean(source.delegation),
    automations: normalizeAutomationOptions(source.automations),
    connectors: normalizeAgentConnectors(source.connectors),
  };
}

export function normalizeAgentPermissions(permissions: AgentPermissions): AgentPermissions {
  return {
    terminal: Boolean(permissions.terminal),
    browser: Boolean(permissions.browser),
    files: Boolean(permissions.files),
    git: Boolean(permissions.git),
    delegation: Boolean(permissions.delegation),
    automations: normalizeAutomationOptions(permissions.automations),
    connectors: normalizeAgentConnectors(permissions.connectors),
  };
}

// ── Channel / delegation normalizers ─────────────────────────────────

export function normalizeChannelTargets(value: unknown, memberAgentIds: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return Object.fromEntries(memberAgentIds.map((id) => [id, ""])) as Record<string, string>;
  }
  const source = value as Record<string, unknown>;
  return Object.fromEntries(
    memberAgentIds.map((id) => [id, typeof source[id] === "string" ? source[id] : ""]),
  ) as Record<string, string>;
}

export function normalizeChannel(channel: Partial<CollaborationChannel>): CollaborationChannel {
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
      (channel as { memberTargets?: unknown }).memberTargets, memberAgentIds,
    ),
    status: channel.status === "blocked" || channel.status === "done" || channel.status === "active"
      ? channel.status : "active",
    linkedDelegationIds: uniqueStrings(asStringArray(channel.linkedDelegationIds ?? [])),
    lastSummary: channel.lastSummary ?? "",
    updatedAt: channel.updatedAt ?? new Date().toISOString(),
  };
}

export function normalizeChannelMessage(
  message: Partial<ChannelMessage>, fallbackChannelId: string,
): ChannelMessage {
  return {
    id: message.id ?? `${fallbackChannelId}-message-${Date.now().toString(36)}`,
    channelId: message.channelId ?? fallbackChannelId,
    sender: message.sender ?? "Workspace",
    senderId: typeof message.senderId === "string" ? message.senderId : null,
    role: message.role === "user" || message.role === "agent" || message.role === "system"
      ? message.role : "system",
    kind: message.kind === "task" || message.kind === "handoff" || message.kind === "result"
      || message.kind === "system" || message.kind === "message" ? message.kind : "message",
    content: message.content ?? "",
    timestamp: message.timestamp ?? new Date().toISOString(),
  };
}

export function normalizeDelegationTask(task: Partial<DelegationTask>): DelegationTask {
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

// ── Derived tool helpers ─────────────────────────────────────────────

export function deriveTools(permissions: AgentPermissions) {
  const tools: string[] = [];
  if (permissions.browser) tools.push("Browser & Web");
  if (permissions.terminal) tools.push("Terminal");
  if (permissions.files) tools.push("Files");
  if (permissions.git) tools.push("Git");
  if (permissions.delegation) tools.push("Delegation");
  if (Object.entries(normalizeAutomationOptions(permissions.automations)).some(
    ([key, enabled]) => key !== "manual" && enabled,
  )) { tools.push("Automations"); }
  const enabledConnectors = connectorCatalog
    .filter((c) => normalizeAgentConnectors(permissions.connectors)[c.key])
    .map((c) => c.label);
  if (enabledConnectors.length > 0) {
    tools.push(...enabledConnectors.map((l) => `${l} connector`));
  }
  return tools;
}

// ── Agent merge logic ────────────────────────────────────────────────

export function mergeDefaultCustomAgents(agents: WorkspaceAgent[]) {
  const settleStartupAgent = (agent: WorkspaceAgent): WorkspaceAgent =>
    agent.status === "active"
      ? { ...agent, status: "idle", currentActivity: "Ready in the thread workspace" }
      : agent;

  const storedById = new Map(agents.map((a) => [a.id, a]));

  const builtIns = defaultCustomAgents.map((defaultAgent) => {
    const existing = storedById.get(defaultAgent.id);
    const shouldRestorePreviousRoute =
      existing !== undefined && existing.provider === "GitHub" &&
      existing.model === "openai/gpt-4.1" && defaultAgent.provider !== "GitHub";

    // Migrate QA Guard to Modal / GLM-5.1 if it's still on the old provider
    const shouldMigrateToModal =
      defaultAgent.id === "qa-guard" &&
      defaultAgent.provider === "Modal" &&
      existing !== undefined &&
      existing.provider !== "Modal";

    if (!existing) {
      return {
        ...defaultAgent,
        permissions: normalizeAgentPermissions(defaultAgent.permissions),
        tools: deriveTools(normalizeAgentPermissions(defaultAgent.permissions)),
      };
    }

    const permissions = normalizeAgentPermissions({
      ...defaultAgent.permissions, ...existing.permissions,
    });

    const mergedAgent = {
      ...defaultAgent, ...existing,
      workspace: resolveWorkspacePath(existing.workspace, defaultAgent.workspace),
      permissions,
      tools: existing.tools && existing.tools.length > 0
        ? uniqueStrings([...defaultAgent.tools, ...existing.tools])
        : deriveTools(permissions),
      specialties: existing.specialties && existing.specialties.length > 0
        ? uniqueStrings([...defaultAgent.specialties, ...existing.specialties])
        : defaultAgent.specialties,
      skills: existing.skills && existing.skills.length > 0
        ? uniqueStrings([...defaultAgent.skills, ...existing.skills])
        : defaultAgent.skills,
    };

    if (shouldRestorePreviousRoute || shouldMigrateToModal) {
      mergedAgent.provider = defaultAgent.provider;
      mergedAgent.model = defaultAgent.model;
    }

    if (defaultAgent.id !== BUILDER_AGENT_ID) {
      return settleStartupAgent(mergedAgent);
    }

    return settleStartupAgent({
      ...mergedAgent,
      subtitle: codexStyleBuilderDefaults.subtitle,
      role: codexStyleBuilderDefaults.role,
      provider: shouldRestorePreviousRoute
        ? codexStyleBuilderDefaults.provider
        : existing?.provider?.trim() || codexStyleBuilderDefaults.provider,
      model: shouldRestorePreviousRoute
        ? codexStyleBuilderDefaults.model
        : existing?.model?.trim() || codexStyleBuilderDefaults.model,
      objective: codexStyleBuilderDefaults.objective,
      systemPrompt: codexStyleBuilderDefaults.systemPrompt,
      specialties: uniqueStrings([
        ...codexStyleBuilderDefaults.specialties, ...(existing?.specialties ?? []),
      ]),
      skills: uniqueStrings([
        ...codexStyleBuilderDefaults.skills, ...(existing?.skills ?? []),
      ]),
      tools: uniqueStrings([
        ...codexStyleBuilderDefaults.tools, ...(existing?.tools ?? []),
      ]),
      sandboxMode: codexStyleBuilderDefaults.sandboxMode,
      permissions: normalizeAgentPermissions({
        ...permissions, ...codexStyleBuilderDefaults.permissions,
        automations: permissions.automations, connectors: permissions.connectors,
      }),
    });
  });

  const extras = agents
    .filter((a) => !defaultCustomAgents.some((d) => d.id === a.id))
    .map((a) => ({
      ...settleStartupAgent(a),
      workspace: resolveWorkspacePath(a.workspace),
      permissions: normalizeAgentPermissions(a.permissions),
      tools: deriveTools(normalizeAgentPermissions(a.permissions)),
    }));

  return [...builtIns, ...extras];
}

// ── Supabase row → domain mappers ────────────────────────────────────

function decodePayload<T>(value: Json, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  return value as unknown as T;
}

export function mapWorkspaceAgentRow(row: WorkspaceAgentRow): WorkspaceAgent {
  return {
    id: row.id, emoji: row.emoji, name: row.name, subtitle: row.subtitle,
    type: row.type, role: row.role, accent: row.accent,
    status: row.status as AgentStatus, currentActivity: row.current_activity,
    lastSeen: row.last_seen, tasksCompleted: row.tasks_completed,
    accuracy: Number(row.accuracy), skills: asStringArray(row.skills),
    source: row.source as WorkspaceAgent["source"], provider: row.provider,
    model: row.model, objective: row.objective, systemPrompt: row.system_prompt,
    specialties: asStringArray(row.specialties), tools: asStringArray(row.tools),
    workspace: resolveWorkspacePath(row.workspace_path),
    sandboxMode: row.sandbox_mode as SandboxMode,
    permissions: asAgentPermissions(row.permissions),
  };
}

export function mapWorkspaceDelegationRow(row: WorkspaceDelegationRow): DelegationTask {
  return normalizeDelegationTask({
    id: row.id, title: row.title, fromAgentId: row.from_agent_id,
    assigneeId: row.assignee_id, status: row.status as DelegationTask["status"],
    priority: row.priority as DelegationTask["priority"], notes: row.notes,
    executionMode: row.execution_mode as DelegationTask["executionMode"],
    payload: row.payload, cwd: row.cwd, updatedAt: row.updated_at,
  });
}

export function mapWorkspaceCommandRunRow(row: WorkspaceCommandRunRow): CommandRun {
  const validStatuses = new Set([
    "queued","planning","running","waiting_for_approval","blocked","completed","failed","canceled",
  ]);
  const status = validStatuses.has(row.status) ? (row.status as CommandRun["status"]) : "failed";
  return {
    id: row.id, agentId: row.agent_id, command: row.command, cwd: row.cwd, status,
    exitCode: row.exit_code, stdout: row.stdout, stderr: row.stderr,
    timedOut: row.timed_out, durationMs: row.duration_ms, createdAt: row.created_at,
    completedAt: null, canceledAt: null, activityKind: "sandbox", activityLabel: "Sandbox Run",
    phase: (row as Record<string, unknown>).phase as string | undefined as CommandRun["phase"],
    retryCount: ((row as Record<string, unknown>).retry_count as number | undefined) ?? 0,
    maxRetries: ((row as Record<string, unknown>).max_retries as number | undefined) ?? 3,
    parentRunId: ((row as Record<string, unknown>).parent_run_id as string | null | undefined) ?? null,
    retryOfRunId: ((row as Record<string, unknown>).retry_of_run_id as string | null | undefined) ?? null,
    model: ((row as Record<string, unknown>).model as string | null | undefined) ?? null,
    provider: ((row as Record<string, unknown>).provider as string | null | undefined) ?? null,
  };
}

export function mapWorkspaceDispatcherDecisionRow(
  row: WorkspaceDispatcherDecisionRow,
): DispatcherDecision {
  return decodePayload(row.payload, {
    id: row.id, prompt: "", intent: row.intent as DispatcherDecision["intent"],
    lane: row.lane as DispatcherDecision["lane"], leadAgentId: row.lead_agent_id,
    collaboratorAgentIds: [], matchedAgentIds: [], reason: "",
    riskLevel: row.risk_level as DispatcherDecision["riskLevel"],
    complexityScore: row.complexity_score, requiresPlanReview: row.requires_plan_review,
    traceSignals: [], createdAt: row.created_at,
  });
}

export function mapWorkspaceContextPackageRow(row: WorkspaceContextPackageRow): ContextPackage {
  return decodePayload(row.payload, {
    id: row.id, agentId: row.agent_id, summary: "", globalContext: [],
    channelContext: [], agentContext: [], provenance: [], createdAt: row.created_at,
  });
}

export function mapWorkspaceTaskTreeRow(row: WorkspaceTaskTreeRow): TaskTree {
  return decodePayload(row.payload, {
    id: row.id, dispatcherDecisionId: row.dispatcher_decision_id, rootPrompt: "",
    status: row.status as TaskTree["status"], rootAgentId: row.root_agent_id,
    nodes: [], createdAt: row.created_at, updatedAt: row.updated_at,
  });
}

export function mapWorkspaceVerifierReviewRow(row: WorkspaceVerifierReviewRow): VerifierReview {
  return decodePayload(row.payload, {
    id: row.id, agentId: row.agent_id, taskTreeId: row.task_tree_id,
    verdict: row.verdict as VerifierReview["verdict"], feedback: "",
    attempts: row.attempts, candidatePreview: "", createdAt: row.created_at,
  });
}

export function mapWorkspacePlanReviewRow(row: WorkspacePlanReviewRow): PlanReviewRequest {
  return decodePayload(row.payload, {
    id: row.id, title: "Plan review", objective: "",
    dispatcherDecisionId: row.dispatcher_decision_id,
    riskLevel: row.risk_level as PlanReviewRequest["riskLevel"],
    steps: [], expectedOutcome: "", riskAssessment: [],
    status: row.status as PlanReviewRequest["status"], createdAt: row.created_at,
  });
}

export function mapWorkspaceCircuitBreakerEventRow(
  row: WorkspaceCircuitBreakerEventRow,
): CircuitBreakerEvent {
  return decodePayload(row.payload, {
    id: row.id, agentId: row.agent_id, reason: "", handoffCount: 0,
    triggeredAt: row.triggered_at,
    resolution: row.resolution as CircuitBreakerEvent["resolution"],
  });
}

export function mapWorkspaceKnowledgeGraphRow(row: WorkspaceKnowledgeGraphRow): KnowledgeGraph {
  return decodePayload(row.payload, {
    nodes: [], edges: [], generatedAt: row.generated_at,
  });
}

export function mapWorkspaceToolDraftRow(row: WorkspaceToolDraftRow): ToolDraft {
  return decodePayload(row.payload, {
    id: row.id, name: "Generated Tool", description: "", scriptPath: "",
    language: row.language as ToolDraft["language"],
    status: row.status as ToolDraft["status"],
    validationNotes: [], createdAt: row.created_at,
  });
}

export function toLiveActivityKind(kind?: string): ActivityKind {
  if (kind === "code.search") return "search";
  if (kind === "filesystem.read" || kind === "filesystem.list") return "read";
  if (kind === "filesystem.write") return "sandbox";
  if (kind === "git.status" || kind === "git.diff" || kind === "git.log") return "git";
  if (kind === "shell.exec") return "sandbox";
  if (kind === "http.request") return "typing";
  if (kind === "delegate.task") return "delegation";
  if (
    kind === "search" || kind === "read" || kind === "git" || kind === "test" ||
    kind === "build" || kind === "install" || kind === "delegation" ||
    kind === "thinking" || kind === "typing"
  ) return kind;
  return "sandbox";
}

export function mapRuntimeRunRecord(run: RuntimeCommandRunRecord): CommandRun {
  const validStatuses = new Set([
    "queued","planning","running","waiting_for_approval","blocked","completed","failed","canceled",
  ]);
  const status = validStatuses.has(run.status) ? run.status : "failed";
  return {
    id: run.id, agentId: run.agentId, agentName: run.agentName,
    command: run.command, cwd: run.cwd, status,
    phase: run.phase, exitCode: typeof run.exitCode === "number" ? run.exitCode : null,
    stdout: run.stdout || "", stderr: run.stderr || "",
    timedOut: Boolean(run.timedOut),
    durationMs: typeof run.durationMs === "number" ? run.durationMs : null,
    createdAt: run.startedAt, completedAt: run.completedAt || null,
    canceledAt: run.canceledAt || null, runtimeRunId: run.id,
    activityKind: toLiveActivityKind(run.activity?.kind),
    activityLabel: run.activity?.label || "Sandbox Run",
    activitySummary: run.activity?.summary || "",
    error: run.error || "", retryCount: run.retryCount ?? 0, maxRetries: run.maxRetries ?? 3,
    parentRunId: run.parentRunId ?? null, retryOfRunId: run.retryOfRunId ?? null,
    model: run.model ?? null, provider: run.provider ?? null, artifacts: run.artifacts ?? [],
  };
}

// ── Message merge / sanitize ─────────────────────────────────────────

export function isCannedAgentSetupMessage(message: Pick<ChatMessage, "id" | "content" | "role">) {
  return (
    (message.role === "system" && message.content.includes("local prototype mode")) ||
    message.content.includes("The UI is real, and the agent profile is real") ||
    message.content.includes("My lane is ") ||
    message.content.includes("this thread is ready to become a real execution lane next")
  );
}

export function groupWorkspaceMessages(rows: WorkspaceMessageRow[]) {
  const grouped: Record<string, ChatMessage[]> = {};
  rows.forEach((row) => {
    if (!grouped[row.agent_id]) grouped[row.agent_id] = [];
    const message = {
      id: row.id, agentId: row.agent_id, role: row.role as ChatMessage["role"],
      sender: row.sender, content: row.content, timestamp: row.message_timestamp,
    };
    if (!isCannedAgentSetupMessage(message)) grouped[row.agent_id].push(message);
  });
  return grouped;
}

export function mergeMessagesByAgent(
  localMessagesByAgent: Record<string, ChatMessage[]>,
  remoteMessagesByAgent: Record<string, ChatMessage[]>,
) {
  const agentIds = new Set([
    ...Object.keys(localMessagesByAgent), ...Object.keys(remoteMessagesByAgent),
  ]);
  const merged: Record<string, ChatMessage[]> = {};
  agentIds.forEach((agentId) => {
    const byId = new Map<string, ChatMessage>();
    for (const m of localMessagesByAgent[agentId] ?? []) byId.set(m.id, m);
    for (const m of remoteMessagesByAgent[agentId] ?? []) {
      const existing = byId.get(m.id);
      const keepLocal = existing?.role === "assistant" && m.role === "assistant"
        && existing.content.length > m.content.length;
      byId.set(m.id, keepLocal ? { ...m, content: existing!.content } : { ...existing, ...m });
    }
    merged[agentId] = Array.from(byId.values()).sort(
      (a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id),
    );
  });
  return merged;
}

export function sanitizeMessagesByAgent(messagesByAgent: Record<string, ChatMessage[]>) {
  let changed = false;
  const sanitized = Object.fromEntries(
    Object.entries(messagesByAgent).map(([agentId, messages]) => {
      const filtered = messages.filter((m) => !isCannedAgentSetupMessage(m));
      if (filtered.length !== messages.length) changed = true;
      return [agentId, filtered];
    }),
  ) as Record<string, ChatMessage[]>;
  return changed ? sanitized : messagesByAgent;
}

// ── Signature helpers for memoization ────────────────────────────────

export function customAgentsSignature(agents: WorkspaceAgent[]) { return JSON.stringify(agents); }
export function delegationSignature(tasks: DelegationTask[]) { return JSON.stringify(tasks); }
export function commandRunsSignature(runs: CommandRun[]) { return JSON.stringify(runs); }
export function taskTreesSignature(taskTrees: TaskTree[]) { return JSON.stringify(taskTrees); }
export function verifierReviewsSignature(reviews: VerifierReview[]) { return JSON.stringify(reviews); }
export function dispatcherDecisionsSignature(decisions: DispatcherDecision[]) { return JSON.stringify(decisions); }
export function planReviewsSignature(reviews: PlanReviewRequest[]) { return JSON.stringify(reviews); }
export function circuitBreakerEventsSignature(events: CircuitBreakerEvent[]) { return JSON.stringify(events); }
export function toolDraftsSignature(drafts: ToolDraft[]) { return JSON.stringify(drafts); }

export function messageMapSignature(messagesByAgent: Record<string, ChatMessage[]>) {
  return JSON.stringify(
    Object.entries(messagesByAgent)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([agentId, messages]) => [
        agentId,
        [...messages].sort((a, b) => a.timestamp.localeCompare(b.timestamp) || a.id.localeCompare(b.id)),
      ]),
  );
}

export function contextPackagesSignature(pkgs: Record<string, ContextPackage>) {
  return JSON.stringify(Object.entries(pkgs).sort(([a], [b]) => a.localeCompare(b)));
}

export function knowledgeGraphsSignature(graphs: Record<string, KnowledgeGraph>) {
  return JSON.stringify(Object.entries(graphs).sort(([a], [b]) => a.localeCompare(b)));
}
