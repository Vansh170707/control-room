import type { RouterDecision } from "@/lib/router/types";
import type { MemoryContextBundle } from "@/lib/phase2";
import type { RiskLevel } from "@/lib/phase3";
import { randomUUID } from "@/lib/utils";

export type AgentHierarchy = "orchestrator" | "specialist" | "verifier";
export type TaskNodeKind =
  | "analysis"
  | "planning"
  | "execution"
  | "research"
  | "review"
  | "synthesis";
export type TaskNodeStatus =
  | "queued"
  | "planning"
  | "running"
  | "waiting_for_approval"
  | "completed"
  | "failed"
  | "blocked";

export interface ContextProvenance {
  id: string;
  type:
    | "thread_summary"
    | "knowledge"
    | "note"
    | "file"
    | "channel"
    | "user_profile"
    | "delegation";
  label: string;
  detail: string;
}

export interface ContextPackage {
  id: string;
  agentId: string;
  summary: string;
  globalContext: string[];
  channelContext: string[];
  agentContext: string[];
  provenance: ContextProvenance[];
  createdAt: string;
}

export interface DispatcherDecision {
  id: string;
  prompt: string;
  intent: RouterDecision["intent"];
  lane: RouterDecision["lane"];
  leadAgentId: string;
  collaboratorAgentIds: string[];
  matchedAgentIds: string[];
  reason: string;
  riskLevel: RiskLevel;
  complexityScore: number;
  requiresPlanReview: boolean;
  traceSignals: string[];
  createdAt: string;
}

export interface TaskTreeNode {
  id: string;
  parentId: string | null;
  title: string;
  description: string;
  kind: TaskNodeKind;
  status: TaskNodeStatus;
  assignedAgentId?: string;
  channelId?: string | null;
  successCriteria: string;
  dependencies: string[];
  updatedAt: string;
}

export interface TaskTree {
  id: string;
  dispatcherDecisionId: string;
  rootPrompt: string;
  status: TaskNodeStatus;
  rootAgentId: string;
  nodes: TaskTreeNode[];
  finalSummary?: string;
  createdAt: string;
  updatedAt: string;
}

export interface DelegationRequest {
  id: string;
  targetAgentId: string;
  channelId: string | null;
  contextPackage: ContextPackage;
  successCriteria: string;
  completionStatus: "queued" | "active" | "completed" | "blocked";
  parentTaskNodeId?: string | null;
  createdAt: string;
}

export interface DelegationResult {
  id: string;
  requestId: string;
  status: "completed" | "blocked" | "canceled";
  summary: string;
  deliveredAt: string;
}

export interface VerifierReview {
  id: string;
  agentId: string;
  taskTreeId?: string | null;
  verdict: "approved" | "rejected";
  feedback: string;
  attempts: number;
  candidatePreview: string;
  createdAt: string;
}

export interface CircuitBreakerEvent {
  id: string;
  agentId: string;
  reason: string;
  handoffCount: number;
  triggeredAt: string;
  resolution: "rewrite_prompt" | "swap_agent" | "ask_user" | "continue";
}

export interface PlanReviewRequest {
  id: string;
  title: string;
  objective: string;
  dispatcherDecisionId: string;
  riskLevel: RiskLevel;
  steps: Array<{ id: string; title: string; outcome: string }>;
  expectedOutcome: string;
  riskAssessment: string[];
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  decidedAt?: string;
}

export interface KnowledgeNode {
  id: string;
  label: string;
  type:
    | "agent"
    | "channel"
    | "knowledge"
    | "note"
    | "file"
    | "technology"
    | "user_preference";
  weight: number;
}

export interface KnowledgeEdge {
  id: string;
  from: string;
  to: string;
  relation:
    | "owns"
    | "contains"
    | "prefers"
    | "references"
    | "depends_on"
    | "collaborates_with";
  strength: number;
}

export interface KnowledgeGraph {
  nodes: KnowledgeNode[];
  edges: KnowledgeEdge[];
  generatedAt: string;
}

export interface ToolDraft {
  id: string;
  name: string;
  description: string;
  scriptPath: string;
  language: "python" | "javascript" | "typescript" | "shell";
  status: "draft" | "validated" | "promoted" | "failed";
  validationNotes: string[];
  createdAt: string;
  validatedAt?: string;
  promotedAt?: string;
}

interface AgentLike {
  id: string;
  name: string;
  role?: string;
  objective?: string;
  systemPrompt?: string;
  provider?: string;
  model?: string;
  workspace?: string;
  permissions?: {
    terminal?: boolean;
    browser?: boolean;
    files?: boolean;
    git?: boolean;
    delegation?: boolean;
  };
}

interface ChannelLike {
  id: string;
  title: string;
  objective?: string;
}

interface DelegationLike {
  id: string;
  title: string;
  assigneeId: string;
  status: string;
}

const STRATEGIC_KEYWORDS = [
  "architecture",
  "roadmap",
  "migration",
  "deploy",
  "production",
  "rewrite",
  "database",
  "system design",
  "security review",
];

const HIGH_RISK_KEYWORDS = [
  "delete",
  "remove",
  "overwrite",
  "deploy",
  "publish",
  "destroy",
  "reset",
  "force push",
];

export function deriveAgentHierarchy(agent: AgentLike): AgentHierarchy {
  const loweredRole = `${agent.role ?? ""} ${agent.objective ?? ""}`.toLowerCase();
  if (agent.permissions?.delegation || loweredRole.includes("orchestr")) {
    return "orchestrator";
  }
  if (
    loweredRole.includes("review") ||
    loweredRole.includes("audit") ||
    loweredRole.includes("verify") ||
    loweredRole.includes("critic")
  ) {
    return "verifier";
  }
  return "specialist";
}

export function scorePromptComplexity(prompt: string, routerDecision: RouterDecision) {
  const lowered = prompt.toLowerCase();
  const strategicMatches = STRATEGIC_KEYWORDS.filter((keyword) =>
    lowered.includes(keyword),
  ).length;
  const highRiskMatches = HIGH_RISK_KEYWORDS.filter((keyword) =>
    lowered.includes(keyword),
  ).length;
  const multiStepBonus =
    /\b(and|then|after|while|compare|review)\b/i.test(prompt) ? 2 : 0;
  const collaboratorBonus = routerDecision.collaboratorAgentIds.length * 2;

  return {
    complexityScore:
      strategicMatches * 3 +
      highRiskMatches * 3 +
      multiStepBonus +
      collaboratorBonus +
      (routerDecision.lane === "channel" ? 2 : 0),
    riskLevel:
      highRiskMatches > 0
        ? ("danger" as RiskLevel)
        : strategicMatches > 0 || routerDecision.lane === "channel"
          ? ("caution" as RiskLevel)
          : ("safe" as RiskLevel),
  };
}

export function shouldRequirePlanReview(prompt: string, routerDecision: RouterDecision) {
  const { complexityScore, riskLevel } = scorePromptComplexity(
    prompt,
    routerDecision,
  );
  return riskLevel !== "safe" || complexityScore >= 6;
}

export function buildDispatcherDecision(input: {
  prompt: string;
  routerDecision: RouterDecision;
}): DispatcherDecision {
  const { complexityScore, riskLevel } = scorePromptComplexity(
    input.prompt,
    input.routerDecision,
  );

  return {
    id: `dispatch_${randomUUID()}`,
    prompt: input.prompt,
    intent: input.routerDecision.intent,
    lane: input.routerDecision.lane,
    leadAgentId: input.routerDecision.leadAgentId,
    collaboratorAgentIds: input.routerDecision.collaboratorAgentIds,
    matchedAgentIds: input.routerDecision.matchedAgentIds,
    reason: input.routerDecision.reason,
    riskLevel,
    complexityScore,
    requiresPlanReview: shouldRequirePlanReview(
      input.prompt,
      input.routerDecision,
    ),
    traceSignals: input.routerDecision.trace.signals,
    createdAt: new Date().toISOString(),
  };
}

export function buildContextPackage(input: {
  agentId: string;
  prompt: string;
  memory: MemoryContextBundle;
  channel?: ChannelLike | null;
  delegations?: DelegationLike[];
  globalPreferences?: string[];
}) {
  const provenance: ContextProvenance[] = [];
  const globalContext = [...(input.globalPreferences ?? [])];
  const channelContext: string[] = [];
  const agentContext: string[] = [];

  if (input.memory.thread?.summary) {
    provenance.push({
      id: `prov_${randomUUID()}`,
      type: "thread_summary",
      label: "Thread summary",
      detail: input.memory.thread.summary,
    });
    agentContext.push(input.memory.thread.summary);
  }

  input.memory.knowledge.slice(0, 4).forEach((entry) => {
    provenance.push({
      id: `prov_${randomUUID()}`,
      type: "knowledge",
      label: entry.title,
      detail: entry.content,
    });
    globalContext.push(`${entry.title}: ${entry.content.slice(0, 180)}`);
  });

  input.memory.notes.slice(0, 4).forEach((note) => {
    provenance.push({
      id: `prov_${randomUUID()}`,
      type: "note",
      label: note.title,
      detail: note.content,
    });
    agentContext.push(`${note.title}: ${note.content.slice(0, 180)}`);
  });

  input.memory.files.slice(0, 4).forEach((file) => {
    provenance.push({
      id: `prov_${randomUUID()}`,
      type: "file",
      label: file.name,
      detail: file.summary || file.path,
    });
    agentContext.push(`${file.name}: ${file.summary || file.path}`);
  });

  if (input.channel) {
    provenance.push({
      id: `prov_${randomUUID()}`,
      type: "channel",
      label: input.channel.title,
      detail: input.channel.objective || "Shared channel context",
    });
    channelContext.push(
      `${input.channel.title}: ${input.channel.objective || "Shared channel context"}`,
    );
  }

  (input.delegations ?? []).slice(0, 4).forEach((delegation) => {
    provenance.push({
      id: `prov_${randomUUID()}`,
      type: "delegation",
      label: delegation.title,
      detail: `${delegation.assigneeId} · ${delegation.status}`,
    });
    channelContext.push(
      `${delegation.title} -> ${delegation.assigneeId} (${delegation.status})`,
    );
  });

  return {
    id: `ctx_${randomUUID()}`,
    agentId: input.agentId,
    summary: [
      `Prompt: ${input.prompt.slice(0, 240)}`,
      input.channel
        ? `Channel: ${input.channel.title}`
        : "Scope: direct thread execution",
      provenance.length > 0
        ? `Context sources: ${provenance.length}`
        : "Context sources: prompt only",
    ].join(" · "),
    globalContext,
    channelContext,
    agentContext,
    provenance,
    createdAt: new Date().toISOString(),
  } satisfies ContextPackage;
}

export function createTaskTreeFromDecision(input: {
  prompt: string;
  dispatcherDecision: DispatcherDecision;
  leadAgent: AgentLike;
  collaboratorAgents?: AgentLike[];
  channelId?: string | null;
}): TaskTree {
  const createdAt = new Date().toISOString();
  const nodes: TaskTreeNode[] = [
    {
      id: `task_${randomUUID()}`,
      parentId: null,
      title: "Analyze request",
      description: "Understand the request, constraints, and initial route.",
      kind: "analysis",
      status: "planning",
      assignedAgentId: input.leadAgent.id,
      channelId: input.channelId ?? null,
      successCriteria: "The intent and execution lane are clear.",
      dependencies: [],
      updatedAt: createdAt,
    },
  ];

  if (input.dispatcherDecision.requiresPlanReview) {
    nodes.push({
      id: `task_${randomUUID()}`,
      parentId: nodes[0]!.id,
      title: "Human plan review",
      description: "Pause on strategic or risky work until the operator approves the plan.",
      kind: "planning",
      status: "waiting_for_approval",
      assignedAgentId: input.leadAgent.id,
      channelId: input.channelId ?? null,
      successCriteria: "The proposed plan is approved or revised.",
      dependencies: [nodes[0]!.id],
      updatedAt: createdAt,
    });
  }

  (input.collaboratorAgents ?? []).forEach((agent) => {
    nodes.push({
      id: `task_${randomUUID()}`,
      parentId: nodes[0]!.id,
      title: `Delegate specialist slice to ${agent.name}`,
      description: `Give ${agent.name} a focused part of the task with explicit success criteria.`,
      kind:
        input.dispatcherDecision.intent === "research" ? "research" : "execution",
      status: "queued",
      assignedAgentId: agent.id,
      channelId: input.channelId ?? null,
      successCriteria: `${agent.name} returns a concrete artifact or conclusion.`,
      dependencies: [nodes[0]!.id],
      updatedAt: createdAt,
    });
  });

  nodes.push(
    {
      id: `task_${randomUUID()}`,
      parentId: nodes[0]!.id,
      title: "Synthesize results",
      description: "Merge specialist outputs or runtime work into one answer.",
      kind: "synthesis",
      status: "queued",
      assignedAgentId: input.leadAgent.id,
      channelId: input.channelId ?? null,
      successCriteria: "The final answer is coherent and complete.",
      dependencies: nodes
        .filter((node) => node.parentId === nodes[0]!.id)
        .map((node) => node.id),
      updatedAt: createdAt,
    },
    {
      id: `task_${randomUUID()}`,
      parentId: null,
      title: "Verifier review",
      description: "Run a bounded critic pass before the answer is finalized.",
      kind: "review",
      status: "queued",
      assignedAgentId: input.leadAgent.id,
      channelId: input.channelId ?? null,
      successCriteria: "Verifier approves or provides bounded corrections.",
      dependencies: [],
      updatedAt: createdAt,
    },
  );

  return {
    id: `tree_${randomUUID()}`,
    dispatcherDecisionId: input.dispatcherDecision.id,
    rootPrompt: input.prompt,
    status: "planning",
    rootAgentId: input.leadAgent.id,
    nodes,
    createdAt,
    updatedAt: createdAt,
  };
}

export function buildPlanReviewRequest(input: {
  dispatcherDecision: DispatcherDecision;
  prompt: string;
  taskTree: TaskTree;
}) {
  const rootSteps = input.taskTree.nodes
    .slice(0, 4)
    .map((node) => ({
      id: node.id,
      title: node.title,
      outcome: node.successCriteria,
    }));

  return {
    id: `plan_${randomUUID()}`,
    title:
      input.dispatcherDecision.lane === "channel"
        ? "Channel execution plan"
        : "Thread execution plan",
    objective: input.prompt,
    dispatcherDecisionId: input.dispatcherDecision.id,
    riskLevel: input.dispatcherDecision.riskLevel,
    steps: rootSteps,
    expectedOutcome:
      "Complete the requested work and return one final, verified answer with any generated artifacts attached in Activity.",
    riskAssessment: [
      input.dispatcherDecision.reason,
      input.dispatcherDecision.riskLevel === "danger"
        ? "The request includes a high-risk signal and should pause for operator review."
        : "The request is multi-step enough that a visible plan helps keep execution aligned.",
    ],
    status: "pending",
    createdAt: new Date().toISOString(),
  } satisfies PlanReviewRequest;
}

export function buildVerifierReview(input: {
  agentId: string;
  taskTreeId?: string | null;
  verdict: "approved" | "rejected";
  feedback: string;
  attempts: number;
  candidatePreview: string;
}): VerifierReview {
  return {
    id: `verify_${randomUUID()}`,
    agentId: input.agentId,
    taskTreeId: input.taskTreeId ?? null,
    verdict: input.verdict,
    feedback: input.feedback,
    attempts: input.attempts,
    candidatePreview: input.candidatePreview,
    createdAt: new Date().toISOString(),
  };
}

export function detectCircuitBreakerEvent(input: {
  agentId: string;
  handoffCount: number;
  repeatedCommandCount: number;
  failureCount: number;
}) {
  if (
    input.handoffCount < 3 &&
    input.repeatedCommandCount < 2 &&
    input.failureCount < 2
  ) {
    return null;
  }

  const reason =
    input.handoffCount >= 3
      ? "Too many agent handoffs without a success state."
      : input.repeatedCommandCount >= 2
        ? "The same sandbox command was suggested repeatedly."
        : "The task failed repeatedly and needs intervention.";

  return {
    id: `breaker_${randomUUID()}`,
    agentId: input.agentId,
    reason,
    handoffCount: Math.max(
      input.handoffCount,
      input.repeatedCommandCount,
      input.failureCount,
    ),
    triggeredAt: new Date().toISOString(),
    resolution:
      input.handoffCount >= 3
        ? "ask_user"
        : input.repeatedCommandCount >= 2
          ? "rewrite_prompt"
          : "swap_agent",
  } satisfies CircuitBreakerEvent;
}

export function buildKnowledgeGraph(input: {
  agent: AgentLike;
  memory: MemoryContextBundle;
  channel?: ChannelLike | null;
  preferences?: {
    techStack?: string[];
    codingStyle?: string;
    preferredLanguage?: string;
  } | null;
}) {
  const nodes: KnowledgeNode[] = [];
  const edges: KnowledgeEdge[] = [];

  const agentNodeId = `agent:${input.agent.id}`;
  nodes.push({
    id: agentNodeId,
    label: input.agent.name,
    type: "agent",
    weight: 1,
  });

  if (input.channel) {
    const channelNodeId = `channel:${input.channel.id}`;
    nodes.push({
      id: channelNodeId,
      label: input.channel.title,
      type: "channel",
      weight: 0.9,
    });
    edges.push({
      id: `edge_${randomUUID()}`,
      from: agentNodeId,
      to: channelNodeId,
      relation: "collaborates_with",
      strength: 0.8,
    });
  }

  input.memory.knowledge.slice(0, 6).forEach((entry, index) => {
    const nodeId = `knowledge:${entry.id}`;
    nodes.push({
      id: nodeId,
      label: entry.title,
      type: "knowledge",
      weight: Math.max(0.4, 1 - index * 0.08),
    });
    edges.push({
      id: `edge_${randomUUID()}`,
      from: agentNodeId,
      to: nodeId,
      relation: "references",
      strength: 0.7,
    });
  });

  input.memory.notes.slice(0, 4).forEach((note, index) => {
    const nodeId = `note:${note.id}`;
    nodes.push({
      id: nodeId,
      label: note.title,
      type: "note",
      weight: Math.max(0.4, 0.9 - index * 0.1),
    });
    edges.push({
      id: `edge_${randomUUID()}`,
      from: agentNodeId,
      to: nodeId,
      relation: "contains",
      strength: 0.6,
    });
  });

  input.memory.files.slice(0, 4).forEach((file) => {
    const nodeId = `file:${file.id}`;
    nodes.push({
      id: nodeId,
      label: file.name,
      type: "file",
      weight: 0.55,
    });
    edges.push({
      id: `edge_${randomUUID()}`,
      from: agentNodeId,
      to: nodeId,
      relation: "contains",
      strength: 0.5,
    });
  });

  (input.preferences?.techStack ?? []).slice(0, 6).forEach((tech) => {
    const nodeId = `tech:${tech.toLowerCase()}`;
    nodes.push({
      id: nodeId,
      label: tech,
      type: "technology",
      weight: 0.8,
    });
    edges.push({
      id: `edge_${randomUUID()}`,
      from: agentNodeId,
      to: nodeId,
      relation: "prefers",
      strength: 0.75,
    });
  });

  if (input.preferences?.codingStyle) {
    const nodeId = `pref:${input.preferences.codingStyle.toLowerCase()}`;
    nodes.push({
      id: nodeId,
      label: input.preferences.codingStyle,
      type: "user_preference",
      weight: 0.65,
    });
    edges.push({
      id: `edge_${randomUUID()}`,
      from: agentNodeId,
      to: nodeId,
      relation: "prefers",
      strength: 0.7,
    });
  }

  if (input.preferences?.preferredLanguage) {
    const nodeId = `lang:${input.preferences.preferredLanguage.toLowerCase()}`;
    nodes.push({
      id: nodeId,
      label: input.preferences.preferredLanguage,
      type: "technology",
      weight: 0.75,
    });
    edges.push({
      id: `edge_${randomUUID()}`,
      from: agentNodeId,
      to: nodeId,
      relation: "prefers",
      strength: 0.8,
    });
  }

  return {
    nodes,
    edges,
    generatedAt: new Date().toISOString(),
  } satisfies KnowledgeGraph;
}
