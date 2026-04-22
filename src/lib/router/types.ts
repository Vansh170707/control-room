export type RouterIntent =
  | "direct_answer"
  | "planning"
  | "execution"
  | "research"
  | "collaboration";

export type RouterExecutionLane = "thread" | "channel";

export interface RouterAgentPermissions {
  terminal: boolean;
  browser: boolean;
  files: boolean;
  git: boolean;
  delegation: boolean;
}

export interface RouterAgentLike {
  id: string;
  name: string;
  role: string;
  objective: string;
  systemPrompt: string;
  specialties: string[];
  skills: string[];
  source: string;
  provider: string;
  model: string;
  sandboxMode: string;
  permissions: RouterAgentPermissions;
}

export interface AgentCapabilityProfile {
  agentId: string;
  name: string;
  role: string;
  provider: string;
  model: string;
  sandboxMode: string;
  permissions: RouterAgentPermissions;
  capabilityTags: string[];
  planningScore: number;
  executionScore: number;
  researchScore: number;
  collaborationScore: number;
  reviewScore: number;
}

export interface PromptExpansionResult {
  normalizedPrompt: string;
  userFacingPrompt: string;
  routingSummary: string;
  channelTitle: string;
  leadInstruction: string;
  collaboratorBriefs: Array<{
    agentId: string;
    instruction: string;
  }>;
}

export interface RouterTrace {
  normalizedRequest: string;
  explicitMentions: string[];
  signals: string[];
  preferredAgentId?: string;
  scoredAgents: Array<{
    agentId: string;
    score: number;
    reasons: string[];
  }>;
  generatedAt: string;
}

export interface RouterDecision {
  intent: RouterIntent;
  lane: RouterExecutionLane;
  leadAgentId: string;
  collaboratorAgentIds: string[];
  matchedAgentIds: string[];
  reason: string;
  promptExpansion: PromptExpansionResult;
  trace: RouterTrace;
}

export interface RouteRequestInput {
  prompt: string;
  agents: RouterAgentLike[];
  preferredAgentId?: string;
  defaultLeadAgentId?: string;
}

// ---------------------------------------------------------------------------
// Phase 4 — Module 15: Collaboration Protocol
// ---------------------------------------------------------------------------

/** Emitted when a @mention is detected inside an *agent* reply (not user). */
export interface AgentMentionEvent {
  fromAgentId: string;
  mentionedAgentId: string;
  mentionSlug: string;
  rawText: string;
  detectedAt: string;
}

/** Signals a direct in-thread handoff from one agent to another. */
export interface HandoffSignal {
  id: string;
  fromAgentId: string;
  fromAgentName: string;
  toAgentId: string;
  toAgentName: string;
  instruction: string;
  /** Whether the triggered agent should yield control back after responding */
  yieldBackAfter: boolean;
  createdAt: string;
}

export interface HandoffRecord {
  signal: HandoffSignal;
  status: "pending" | "accepted" | "declined" | "completed";
  resolvedAt?: string;
}

