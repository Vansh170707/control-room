/**
 * Phase 4 — The Agentic Team (Evolution & Alignment)
 *
 * Module 15: Collaboration Protocol
 * Module 16: Dynamic Agent Creator
 * Module 17: Meta-Reflection Loop
 * Module 18: Digital Twin Profile
 */

import { extractMentionSlugs } from "@/lib/router/index";
import type { HandoffSignal, AgentMentionEvent } from "@/lib/router/types";
import type { RuntimeChatMessage } from "@/lib/agent-runtime";
import { randomUUID } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Shared Agent shape (minimal, avoids circular imports)
// ---------------------------------------------------------------------------

export interface AgentStub {
  id: string;
  name: string;
  emoji?: string;
  objective?: string;
  systemPrompt?: string;
  provider?: string;
  model?: string;
  permissions?: {
    terminal?: boolean;
    browser?: boolean;
    files?: boolean;
    git?: boolean;
    delegation?: boolean;
  };
  sandboxMode?: string;
}

// ---------------------------------------------------------------------------
// Module 15 — Collaboration Protocol
// ---------------------------------------------------------------------------

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/**
 * Resolve a mention slug (from an agent reply) to an actual agent.
 * Tries: id match → slug of name → starts-with slug.
 */
export function resolveAgentByMention(
  slug: string,
  agents: AgentStub[],
): AgentStub | undefined {
  const normalized = slug.toLowerCase();
  return (
    agents.find((a) => a.id.toLowerCase() === normalized) ??
    agents.find((a) => slugify(a.name) === normalized) ??
    agents.find((a) => slugify(a.name).startsWith(normalized))
  );
}

/**
 * Scan an agent reply for @mentions that map to real agents.
 * Returns one HandoffSignal per distinct mention found.
 */
export function parseAgentMentions(
  rawText: string,
  fromAgent: AgentStub,
  allAgents: AgentStub[],
): { signals: HandoffSignal[]; events: AgentMentionEvent[] } {
  const slugs = extractMentionSlugs(rawText);
  const signals: HandoffSignal[] = [];
  const events: AgentMentionEvent[] = [];
  const seen = new Set<string>();

  for (const slug of slugs) {
    const target = resolveAgentByMention(slug, allAgents);
    if (!target || target.id === fromAgent.id || seen.has(target.id)) continue;
    seen.add(target.id);

    const now = new Date().toISOString();
    events.push({
      fromAgentId: fromAgent.id,
      mentionedAgentId: target.id,
      mentionSlug: slug,
      rawText,
      detectedAt: now,
    });

    signals.push({
      id: randomUUID(),
      fromAgentId: fromAgent.id,
      fromAgentName: fromAgent.name,
      toAgentId: target.id,
      toAgentName: target.name,
      instruction: buildHandoffInstruction(fromAgent, target, rawText),
      yieldBackAfter: true,
      createdAt: now,
    });
  }

  return { signals, events };
}

/**
 * Build the instruction block the targeted agent receives when handed off to.
 */
export function buildHandoffInstruction(
  fromAgent: AgentStub,
  toAgent: AgentStub,
  originalMessage: string,
): string {
  const excerpt = originalMessage.slice(0, 600).trim();
  return [
    `You have been called upon by **${fromAgent.name}** (${fromAgent.emoji ?? "🤖"}).`,
    ``,
    `Their message:`,
    `> ${excerpt}`,
    ``,
    `Handle the part of this request that fits your specialty. When done, yield control back to ${fromAgent.name}.`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// Module 16 — Dynamic Agent Creator
// ---------------------------------------------------------------------------

export interface CapabilityGap {
  missingCapability: string;
  detectedFromPrompt: string;
  suggestedName: string;
  suggestedRole: string;
  suggestedSkills: string[];
  needsTerminal: boolean;
  needsBrowser: boolean;
  needsFiles: boolean;
  confidence: number; // 0–1
}

export interface AgentBlueprint {
  name: string;
  emoji: string;
  objective: string;
  systemPrompt: string;
  provider: string;
  model: string;
  sandboxMode: "none" | "read-only" | "workspace-write";
  permissions: {
    terminal: boolean;
    browser: boolean;
    files: boolean;
    git: boolean;
    delegation: boolean;
  };
}

// Keyword → role mapping for rule-based blueprint generation
const ROLE_BLUEPRINTS: Array<{
  keywords: string[];
  name: string;
  emoji: string;
  role: string;
  skills: string[];
  terminal: boolean;
  browser: boolean;
  files: boolean;
}> = [
  {
    keywords: ["ui", "ux", "design", "landing", "frontend", "css", "style", "figma", "tailwind"],
    name: "Designer",
    emoji: "🎨",
    role: "UI/UX Specialist",
    skills: ["frontend", "css", "design-systems", "accessibility"],
    terminal: false,
    browser: true,
    files: true,
  },
  {
    keywords: ["test", "qa", "quality", "spec", "coverage", "regression", "unit", "integration"],
    name: "QA Engineer",
    emoji: "🧪",
    role: "Quality Assurance",
    skills: ["testing", "qa", "regression", "coverage"],
    terminal: true,
    browser: false,
    files: true,
  },
  {
    keywords: ["deploy", "devops", "docker", "kubernetes", "ci", "cd", "pipeline", "infra", "cloud"],
    name: "DevOps Agent",
    emoji: "⚙️",
    role: "DevOps & Infrastructure",
    skills: ["docker", "ci-cd", "deployment", "infrastructure"],
    terminal: true,
    browser: false,
    files: true,
  },
  {
    keywords: ["data", "analyse", "analyze", "chart", "graph", "sql", "database", "analytics"],
    name: "Data Analyst",
    emoji: "📊",
    role: "Data & Analytics",
    skills: ["data-analysis", "sql", "visualization", "reporting"],
    terminal: true,
    browser: false,
    files: true,
  },
  {
    keywords: ["write", "copy", "content", "blog", "doc", "documentation", "readme", "technical writer"],
    name: "Technical Writer",
    emoji: "✍️",
    role: "Documentation & Content",
    skills: ["writing", "documentation", "markdown", "content"],
    terminal: false,
    browser: true,
    files: true,
  },
  {
    keywords: ["security", "vulnerability", "audit", "pentest", "exploit", "cve"],
    name: "Security Analyst",
    emoji: "🔐",
    role: "Security & Audit",
    skills: ["security", "vulnerability-analysis", "audit"],
    terminal: true,
    browser: true,
    files: true,
  },
];

/**
 * Detect if the user's prompt requires a capability missing from the roster.
 * Returns null if the existing agents are sufficient.
 */
export function detectCapabilityGap(
  prompt: string,
  agents: AgentStub[],
  lowScoreThreshold = 15,
): CapabilityGap | null {
  const normalizedPrompt = prompt.toLowerCase();

  for (const blueprint of ROLE_BLUEPRINTS) {
    const matchedKeywords = blueprint.keywords.filter((kw) =>
      normalizedPrompt.includes(kw),
    );
    if (matchedKeywords.length === 0) continue;

    // Check if any existing agent covers this role
    const covered = agents.some((agent) => {
      const agentText = [
        agent.name,
        agent.objective ?? "",
        agent.systemPrompt ?? "",
      ]
        .join(" ")
        .toLowerCase();
      return blueprint.skills.some((skill) => agentText.includes(skill));
    });

    if (!covered) {
      const confidence = Math.min(1, matchedKeywords.length / 3);
      return {
        missingCapability: blueprint.role,
        detectedFromPrompt: prompt,
        suggestedName: blueprint.name,
        suggestedRole: blueprint.role,
        suggestedSkills: blueprint.skills,
        needsTerminal: blueprint.terminal,
        needsBrowser: blueprint.browser,
        needsFiles: blueprint.files,
        confidence,
      };
    }
  }

  return null;
}

/**
 * Generate a full agent blueprint for a detected gap.
 * Rule-based — no LLM call required.
 */
export function generateAgentBlueprint(
  gap: CapabilityGap,
  userProfile?: DigitalTwinProfile | null,
): AgentBlueprint {
  const techHint = userProfile?.techStack?.slice(0, 3).join(", ") ?? "";
  const styleHint = userProfile?.codingStyle ?? "";

  const roleRow = ROLE_BLUEPRINTS.find((r) => r.role === gap.missingCapability);
  const emoji = roleRow?.emoji ?? "🤖";

  const systemPromptParts = [
    `You are a specialist ${gap.suggestedRole} agent in a multi-agent workspace.`,
    `Your primary skills are: ${gap.suggestedSkills.join(", ")}.`,
    `Focus exclusively on tasks that fit your specialty. When collaborating, hand off work that is outside your domain.`,
  ];

  if (techHint) {
    systemPromptParts.push(`The user's preferred tech stack is: ${techHint}.`);
  }
  if (styleHint) {
    systemPromptParts.push(`Coding style preference: ${styleHint}.`);
  }

  return {
    name: gap.suggestedName,
    emoji,
    objective: `${gap.suggestedRole} — ${gap.suggestedSkills.slice(0, 2).join(" & ")}`,
    systemPrompt: systemPromptParts.join("\n\n"),
    provider: "Anthropic",
    model: "claude-3-7-sonnet",
    sandboxMode: gap.needsTerminal ? "workspace-write" : gap.needsFiles ? "read-only" : "none",
    permissions: {
      terminal: gap.needsTerminal,
      browser: gap.needsBrowser,
      files: gap.needsFiles,
      git: gap.needsTerminal,
      delegation: false,
    },
  };
}

// ---------------------------------------------------------------------------
// Module 17 — Meta-Reflection Loop
// ---------------------------------------------------------------------------

export type LearningEventType =
  | "critic_rejection"
  | "user_correction"
  | "tool_failure"
  | "handoff_declined"
  | "timeout";

export interface LearningEvent {
  id: string;
  agentId: string;
  agentName: string;
  type: LearningEventType;
  description: string;
  metadata?: Record<string, unknown>;
  occurredAt: string;
}

export interface FailurePattern {
  type: LearningEventType;
  count: number;
  examples: string[];
}

export interface ReflectionReport {
  agentId: string;
  totalEvents: number;
  failurePatterns: FailurePattern[];
  strongestPattern: FailurePattern | null;
  generatedAt: string;
}

/**
 * Create a new learning event record.
 */
export function createLearningEvent(
  agentId: string,
  agentName: string,
  type: LearningEventType,
  description: string,
  metadata?: Record<string, unknown>,
): LearningEvent {
  return {
    id: randomUUID(),
    agentId,
    agentName,
    type,
    description,
    metadata,
    occurredAt: new Date().toISOString(),
  };
}

/**
 * Compile a structured failure digest from a list of learning events for one agent.
 */
export function buildReflectionReport(
  agentId: string,
  events: LearningEvent[],
): ReflectionReport {
  const agentEvents = events.filter((e) => e.agentId === agentId);

  const grouped: Record<string, LearningEvent[]> = {};
  for (const event of agentEvents) {
    if (!grouped[event.type]) grouped[event.type] = [];
    grouped[event.type]!.push(event);
  }

  const failurePatterns: FailurePattern[] = Object.entries(grouped).map(
    ([type, evts]) => ({
      type: type as LearningEventType,
      count: evts.length,
      examples: evts.slice(0, 3).map((e) => e.description),
    }),
  );

  failurePatterns.sort((a, b) => b.count - a.count);

  return {
    agentId,
    totalEvents: agentEvents.length,
    failurePatterns,
    strongestPattern: failurePatterns[0] ?? null,
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Generate a rewritten system prompt patch based on the reflection report.
 * Appends a "Lessons Learned" section to the existing system prompt.
 */
export function generatePromptPatch(
  currentSystemPrompt: string,
  report: ReflectionReport,
): string {
  if (report.failurePatterns.length === 0) return currentSystemPrompt;

  const lessons: string[] = [];

  for (const pattern of report.failurePatterns.slice(0, 3)) {
    if (pattern.type === "critic_rejection") {
      lessons.push(
        `- Your responses have been rejected ${pattern.count} times by the Critic. Focus on being more precise, complete, and directly addressing the request before adding extras.`,
      );
    }
    if (pattern.type === "user_correction") {
      lessons.push(
        `- Users have corrected your output ${pattern.count} times. Re-read the request carefully before responding; do not assume or over-generalize.`,
      );
    }
    if (pattern.type === "tool_failure") {
      lessons.push(
        `- Tools have failed ${pattern.count} times under your instructions. Verify parameters and paths before calling tools; prefer read-before-write.`,
      );
    }
    if (pattern.type === "handoff_declined") {
      lessons.push(
        `- Handoffs you initiated were declined ${pattern.count} times. Only tag other agents when the task clearly exceeds your capability domain.`,
      );
    }
    if (pattern.type === "timeout") {
      lessons.push(
        `- ${pattern.count} operations timed out. Break large tasks into smaller, verifiable steps instead of long single-pass executions.`,
      );
    }
  }

  const lessonsBlock = [
    "\n\n---\n## Lessons Learned (auto-generated by Meta-Reflection)",
    ...lessons,
  ].join("\n");

  // Remove old lessons section if present (idempotent)
  const stripped = currentSystemPrompt.replace(
    /\n\n---\n## Lessons Learned \(auto-generated by Meta-Reflection\)[\s\S]*/,
    "",
  );

  return stripped + lessonsBlock;
}

// ---------------------------------------------------------------------------
// Module 18 — Digital Twin Profile
// ---------------------------------------------------------------------------

export interface DigitalTwinProfile {
  techStack: string[];
  codingStyle: string;
  preferredLanguage: string;
  workflowNotes: string;
  timezone: string;
  updatedAt: string;
}

export const DEFAULT_DIGITAL_TWIN_PROFILE: DigitalTwinProfile = {
  techStack: [],
  codingStyle: "clean, well-commented",
  preferredLanguage: "TypeScript",
  workflowNotes: "",
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  updatedAt: new Date().toISOString(),
};

/**
 * Build the system message block injected into every agent's context.
 */
export function buildUserProfileInjection(profile: DigitalTwinProfile): string {
  const parts: string[] = ["## User Profile (Digital Twin)"];

  if (profile.techStack.length > 0) {
    parts.push(`**Tech Stack:** ${profile.techStack.join(", ")}`);
  }
  if (profile.codingStyle) {
    parts.push(`**Coding Style:** ${profile.codingStyle}`);
  }
  if (profile.preferredLanguage) {
    parts.push(`**Preferred Language:** ${profile.preferredLanguage}`);
  }
  if (profile.workflowNotes) {
    parts.push(`**Workflow:** ${profile.workflowNotes}`);
  }
  if (profile.timezone) {
    parts.push(`**Timezone:** ${profile.timezone}`);
  }

  parts.push(
    "\nUse this context to personalize your responses. Match the user's coding style, prefer their tech stack, and adapt your communication to their workflow.",
  );

  return parts.join("\n");
}

/**
 * Safely deep-merge a partial profile update into the current profile.
 */
export function mergeProfileUpdate(
  current: DigitalTwinProfile,
  patch: Partial<DigitalTwinProfile>,
): DigitalTwinProfile {
  return {
    ...current,
    ...patch,
    techStack:
      patch.techStack !== undefined ? patch.techStack : current.techStack,
    updatedAt: new Date().toISOString(),
  };
}

const PROFILE_INJECTION_MARKER = "<!-- digital-twin-profile -->";

/**
 * Prepend the profile injection block to the message list.
 * Idempotent: replaces an existing injection if present.
 */
export function injectProfileIntoMessages(
  messages: RuntimeChatMessage[],
  profile: DigitalTwinProfile,
): RuntimeChatMessage[] {
  const injectionContent =
    PROFILE_INJECTION_MARKER + "\n" + buildUserProfileInjection(profile);

  // Remove any previous injection
  const stripped = messages.filter(
    (msg) =>
      !(
        msg.role === "system" &&
        msg.content.startsWith(PROFILE_INJECTION_MARKER)
      ),
  );

  // Skip injection if profile has no meaningful data
  const hasData =
    profile.techStack.length > 0 ||
    profile.workflowNotes.trim().length > 0 ||
    profile.preferredLanguage !== DEFAULT_DIGITAL_TWIN_PROFILE.preferredLanguage;

  if (!hasData) {
    return stripped;
  }

  return [{ role: "system", content: injectionContent }, ...stripped];
}
