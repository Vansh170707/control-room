/**
 * Phase 3 — The Scale (Optimization & Control)
 *
 * Module 12: Cognitive Load Manager
 * Module 13: Parallel Execution Engine
 * Module 14: HITL Gate Upgrade (Risk Assessment)
 */

import type { RuntimeChatMessage } from "@/lib/agent-runtime";

// ---------------------------------------------------------------------------
// Shared constants
// ---------------------------------------------------------------------------

export const DEFAULT_CONTEXT_WINDOW_TOKENS = 128_000;
export const SUMMARIZE_THRESHOLD = 0.70; // trigger at 70% capacity
export const ANCHOR_TAG = "[[ANCHOR]]"; // embedded in message metadata

// ---------------------------------------------------------------------------
// Module 12 — Cognitive Load Manager
// ---------------------------------------------------------------------------

export interface ContextStats {
  tokenCount: number;
  capacityPct: number;
  pinnedCount: number;
  shouldCompress: boolean;
}

/** Rough token estimate: 1 token ≈ 4 chars */
export function estimateTokens(text: string): number {
  return Math.ceil((text ?? "").length / 4);
}

export function estimateContextUsage(
  messages: RuntimeChatMessage[],
  contextWindowTokens = DEFAULT_CONTEXT_WINDOW_TOKENS,
): ContextStats {
  const tokenCount = messages.reduce(
    (sum, m) => sum + estimateTokens(m.content),
    0,
  );
  const capacityPct = tokenCount / contextWindowTokens;
  return {
    tokenCount,
    capacityPct,
    pinnedCount: 0, // populated by the store after merging pinned list
    shouldCompress: capacityPct >= SUMMARIZE_THRESHOLD,
  };
}

export function shouldSummarize(
  messages: RuntimeChatMessage[],
  threshold = SUMMARIZE_THRESHOLD,
  contextWindowTokens = DEFAULT_CONTEXT_WINDOW_TOKENS,
): boolean {
  const { capacityPct } = estimateContextUsage(messages, contextWindowTokens);
  return capacityPct >= threshold;
}

/**
 * Compress messages while keeping pinned ones intact.
 *
 * Strategy:
 *  1. Separate messages into pinned vs non-pinned.
 *  2. Keep the last 5 non-pinned verbatim (recency window).
 *  3. Summarize older non-pinned messages into a State Summary system block.
 *  4. Rebuild: [pinned...] + [summary system message] + [last 5 non-pinned].
 */
export function compressContextWithAnchorPoints(
  messages: RuntimeChatMessage[],
  pinnedIds: Set<string>,
): RuntimeChatMessage[] {
  // Split pinned vs normal — we use a synthetic id injected via sender field fallback
  const pinned: RuntimeChatMessage[] = [];
  const normal: RuntimeChatMessage[] = [];

  for (const msg of messages) {
    const id = (msg as RuntimeChatMessage & { id?: string }).id ?? "";
    if (pinnedIds.has(id)) {
      pinned.push(msg);
    } else {
      normal.push(msg);
    }
  }

  const RECENCY_WINDOW = 5;
  const toCompress = normal.slice(0, Math.max(0, normal.length - RECENCY_WINDOW));
  const recency = normal.slice(-RECENCY_WINDOW);

  if (toCompress.length === 0) {
    return messages; // nothing to compress yet
  }

  const summaryLines = toCompress.map((m) => {
    const role = m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "System";
    return `[${role}]: ${m.content.slice(0, 300)}`;
  });

  const stateSummaryMessage: RuntimeChatMessage = {
    role: "system",
    content: [
      `State Summary (${toCompress.length} compressed messages):`,
      summaryLines.join("\n"),
    ].join("\n"),
  };

  return [...pinned, stateSummaryMessage, ...recency];
}

/**
 * Full cognitive load check for an agent's message list.
 * Returns the updated (possibly compressed) message list.
 */
export function runCognitiveLoadCheck(
  messages: RuntimeChatMessage[],
  pinnedIds: Set<string>,
  contextWindowTokens = DEFAULT_CONTEXT_WINDOW_TOKENS,
): { messages: RuntimeChatMessage[]; compressed: boolean; stats: ContextStats } {
  const stats = estimateContextUsage(messages, contextWindowTokens);
  if (!stats.shouldCompress) {
    return { messages, compressed: false, stats };
  }

  const compressed = compressContextWithAnchorPoints(messages, pinnedIds);
  const newStats = estimateContextUsage(compressed, contextWindowTokens);
  return {
    messages: compressed,
    compressed: true,
    stats: { ...newStats, pinnedCount: pinnedIds.size },
  };
}

// ---------------------------------------------------------------------------
// Module 13 — Parallel Execution Engine
// ---------------------------------------------------------------------------

export interface ParallelToolCall {
  tool: string;
  parameters: Record<string, unknown>;
}

export type ParallelToolStatus = "queued" | "running" | "success" | "error";

export interface ParallelBatchResult {
  tool: string;
  parameters: Record<string, unknown>;
  status: ParallelToolStatus;
  result?: unknown;
  error?: string;
  durationMs?: number;
}

export interface ParallelBatch {
  id: string;
  agentId: string;
  calls: ParallelToolCall[];
  results: ParallelBatchResult[];
  startedAt: string;
  completedAt?: string;
  status: "running" | "done" | "partial";
}

/**
 * Parse a `<parallel_tools>` JSON array from raw model output.
 *
 * Expected format in the model response:
 * <parallel_tools>
 * [{"tool":"run_command","parameters":{"command":"ls -la"}},...]
 * </parallel_tools>
 */
export function parseParallelToolCalls(raw: string): ParallelToolCall[] {
  const match = raw.match(/<parallel_tools>([\s\S]*?)<\/parallel_tools>/i);
  if (!match?.[1]) return [];

  try {
    const parsed = JSON.parse(match[1].trim()) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed.filter(
      (item): item is ParallelToolCall =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as Record<string, unknown>).tool === "string",
    );
  } catch {
    return [];
  }
}

/**
 * Execute a batch of tool calls concurrently using Promise.allSettled.
 * The executor receives each call and returns a result or throws.
 */
export async function executeParallelToolBatch<T>(
  calls: ParallelToolCall[],
  executeFn: (call: ParallelToolCall) => Promise<T>,
): Promise<ParallelBatchResult[]> {
  const started = Date.now();

  const settled = await Promise.allSettled(
    calls.map((call) => executeFn(call)),
  );

  return settled.map((outcome, index): ParallelBatchResult => {
    const call = calls[index]!;
    const durationMs = Date.now() - started;

    if (outcome.status === "fulfilled") {
      return {
        tool: call.tool,
        parameters: call.parameters,
        status: "success",
        result: outcome.value,
        durationMs,
      };
    }

    return {
      tool: call.tool,
      parameters: call.parameters,
      status: "error",
      error:
        outcome.reason instanceof Error
          ? outcome.reason.message
          : String(outcome.reason ?? "Unknown error"),
      durationMs,
    };
  });
}

/**
 * Combine parallel batch results into a single markdown Observation block
 * suitable for injecting back into the agent's context.
 */
export function formatObservationBlock(results: ParallelBatchResult[]): string {
  const lines = results.map((r) => {
    const status = r.status === "success" ? "✓" : "✗";
    const detail =
      r.status === "success"
        ? typeof r.result === "string"
          ? r.result.slice(0, 400)
          : JSON.stringify(r.result ?? "").slice(0, 400)
        : `error: ${r.error ?? "unknown"}`;
    return `[${r.tool}] ${status} ${detail}`;
  });

  return ["<observation>", ...lines, "</observation>"].join("\n");
}

// ---------------------------------------------------------------------------
// Module 14 — HITL Gate: Risk Assessment
// ---------------------------------------------------------------------------

export type RiskLevel = "safe" | "caution" | "danger";

export interface CommandRiskReport {
  riskLevel: RiskLevel;
  reasons: string[];
  blastRadius: string;
  autoApprovable: boolean;
}

export interface AgentTrustPolicy {
  agentId: string;
  autoApproveSafe: boolean;
  allowedPatterns: string[];   // regex strings that are always allowed
  blockedPatterns: string[];   // regex strings that are always blocked
  updatedAt: string;
}

export type ApprovalDecision = "approved" | "rejected" | "auto_approved";

export interface ApprovalQueueItem {
  id: string;
  agentId: string;
  agentName: string;
  agentEmoji?: string;
  command: string;
  cwd: string;
  riskReport: CommandRiskReport;
  source: "runner" | "delegation" | "agent";
  requestedAt: string;
  decision?: ApprovalDecision;
  resolvedAt?: string;
}

// Patterns that always trigger "danger"
const DANGER_PATTERNS: RegExp[] = [
  /\brm\s+-rf\s+\/\b/i,
  /\bsudo\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\bdd\s+if=/i,
  /\bchmod\s+-R\s+777\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+push\s+.*--force\b/i,
  /\bgit\s+clean\s+-fd\b/i,
];

// Patterns that trigger "caution"
const CAUTION_PATTERNS: RegExp[] = [
  /\brm\b/i,
  /\bgit\s+push\b/i,
  /\bgit\s+reset\b/i,
  /\bnpm\s+publish\b/i,
  /\bcurl\b.*\|\s*(bash|sh)\b/i,
  /\bwget\b.*\|\s*(bash|sh)\b/i,
  /\bchown\b/i,
  /\bchmod\b/i,
  /\bwrite_file\b/i,
  /\bedit_file\b/i,
  /\bdelete_file\b/i,
];

/**
 * Assess the risk level of a command given the agent's trust policy.
 */
export function assessCommandRisk(
  command: string,
  cwd: string,
  policy?: AgentTrustPolicy,
): CommandRiskReport {
  const reasons: string[] = [];
  let riskLevel: RiskLevel = "safe";

  // Check user-defined blocked patterns first
  if (policy?.blockedPatterns.length) {
    for (const pattern of policy.blockedPatterns) {
      try {
        if (new RegExp(pattern, "i").test(command)) {
          reasons.push(`Blocked by agent policy: ${pattern}`);
          riskLevel = "danger";
        }
      } catch {
        // invalid regex — skip
      }
    }
  }

  // Check danger patterns
  if (riskLevel !== "danger") {
    for (const pattern of DANGER_PATTERNS) {
      if (pattern.test(command)) {
        reasons.push(`Matches danger pattern: ${pattern.source}`);
        riskLevel = "danger";
        break;
      }
    }
  }

  // Check caution patterns
  if (riskLevel === "safe") {
    for (const pattern of CAUTION_PATTERNS) {
      if (pattern.test(command)) {
        reasons.push(`Matches caution pattern: ${pattern.source}`);
        riskLevel = "caution";
      }
    }
  }

  // Check user-defined allowed patterns (override caution → safe)
  if (riskLevel === "caution" && policy?.allowedPatterns.length) {
    for (const pattern of policy.allowedPatterns) {
      try {
        if (new RegExp(pattern, "i").test(command)) {
          riskLevel = "safe";
          reasons.push(`Overridden safe by policy: ${pattern}`);
          break;
        }
      } catch {
        // invalid regex — skip
      }
    }
  }

  const blastRadius = buildBlastRadiusSummary(command, cwd, riskLevel);

  const autoApprovable =
    riskLevel === "safe" && Boolean(policy?.autoApproveSafe);

  return { riskLevel, reasons, blastRadius, autoApprovable };
}

/**
 * Generate a plain-language blast radius description for the approval modal.
 */
function buildBlastRadiusSummary(
  command: string,
  cwd: string,
  riskLevel: RiskLevel,
): string {
  if (riskLevel === "safe") {
    return "Read-only or low-impact. No destructive side effects expected.";
  }

  const parts: string[] = [`Working directory: ${cwd}`];

  if (/\brm\b/i.test(command)) {
    const target = command.match(/rm\s+(?:-[a-z]+\s+)?(.+)/i)?.[1] ?? "specified path";
    parts.push(`Will permanently delete: ${target}`);
  }

  if (/\bgit\s+push\b/i.test(command)) {
    parts.push("Will push commits to the remote repository. This cannot be undone locally.");
  }

  if (/\bgit\s+reset\b/i.test(command)) {
    parts.push("Will rewrite local git history. Staged changes may be lost.");
  }

  if (/\bnpm\s+publish\b/i.test(command)) {
    parts.push("Will publish a package to NPM. Version will be immediately public.");
  }

  if (/\bcurl\b.*\|/i.test(command) || /\bwget\b.*\|/i.test(command)) {
    parts.push("Downloads and executes remote code. This is a high-risk operation.");
  }

  if (riskLevel === "danger") {
    parts.push("🔴 This action is potentially irreversible.");
  }

  return parts.join(" | ");
}

/**
 * Default trust policy for a new agent.
 */
export function defaultTrustPolicy(agentId: string): AgentTrustPolicy {
  return {
    agentId,
    autoApproveSafe: false,
    allowedPatterns: [],
    blockedPatterns: [],
    updatedAt: new Date().toISOString(),
  };
}
