import type {
  AgentCapabilityProfile,
  PromptExpansionResult,
  RouteRequestInput,
  RouterAgentLike,
  RouterDecision,
  RouterIntent,
} from "./types";

const PLANNING_SIGNALS = [
  "plan",
  "architecture",
  "system",
  "roadmap",
  "scope",
  "design",
  "spec",
  "structure",
];

const EXECUTION_SIGNALS = [
  "build",
  "implement",
  "code",
  "fix",
  "debug",
  "refactor",
  "ship",
  "run",
  "test",
  "terminal",
  "sandbox",
  "file",
  "workspace",
];

const RESEARCH_SIGNALS = [
  "research",
  "docs",
  "documentation",
  "browser",
  "website",
  "web",
  "search",
  "scrape",
  "compare",
  "market",
  "analyze",
];

const COLLABORATION_SIGNALS = [
  "channel",
  "delegate",
  "handoff",
  "team",
  "agents",
  "collaborate",
  "split this",
  "workstreams",
  "parallel",
];

const REVIEW_SIGNALS = [
  "review",
  "qa",
  "validate",
  "regression",
  "check",
  "audit",
  "verify",
];

const MULTI_STEP_SIGNALS = [
  " and ",
  " then ",
  " after ",
  " compare ",
  " research and ",
  " build and ",
  " review and ",
];

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

export function extractMentionSlugs(prompt: string) {
  return Array.from(
    new Set(
      [...prompt.matchAll(/@([a-z0-9][a-z0-9-]*)/gi)].map((match) =>
        match[1].toLowerCase(),
      ),
    ),
  );
}

function normalizePrompt(prompt: string) {
  return prompt.replace(/\s+/g, " ").trim();
}

function includesAny(normalizedPrompt: string, signals: string[]) {
  return signals.filter((signal) => normalizedPrompt.includes(signal));
}

function scoreFromSignals(tags: Set<string>, signals: string[]) {
  return signals.reduce((total, signal) => total + (tags.has(signal) ? 1 : 0), 0);
}

function buildCapabilityTags(agent: RouterAgentLike) {
  const raw = [
    agent.id,
    agent.name,
    agent.role,
    agent.objective,
    ...agent.specialties,
    ...agent.skills,
  ]
    .join(" ")
    .toLowerCase();

  const tags = new Set(
    raw
      .split(/[^a-z0-9]+/)
      .map((part) => part.trim())
      .filter(Boolean),
  );

  if (agent.permissions.terminal) tags.add("terminal");
  if (agent.permissions.browser) tags.add("browser");
  if (agent.permissions.files) tags.add("files");
  if (agent.permissions.git) tags.add("git");
  if (agent.permissions.delegation) tags.add("delegation");

  return tags;
}

export function buildAgentCapabilityRegistry(agents: RouterAgentLike[]): AgentCapabilityProfile[] {
  return agents.map((agent) => {
    const tags = buildCapabilityTags(agent);
    return {
      agentId: agent.id,
      name: agent.name,
      role: agent.role,
      provider: agent.provider,
      model: agent.model,
      sandboxMode: agent.sandboxMode,
      permissions: agent.permissions,
      capabilityTags: [...tags].sort(),
      planningScore:
        scoreFromSignals(tags, PLANNING_SIGNALS) +
        (tags.has("architecture") ? 2 : 0) +
        (tags.has("systems") ? 1 : 0),
      executionScore:
        scoreFromSignals(tags, EXECUTION_SIGNALS) +
        (agent.permissions.terminal ? 3 : 0) +
        (agent.permissions.files ? 1 : 0) +
        (agent.permissions.git ? 1 : 0),
      researchScore:
        scoreFromSignals(tags, RESEARCH_SIGNALS) +
        (agent.permissions.browser ? 3 : 0),
      collaborationScore:
        scoreFromSignals(tags, COLLABORATION_SIGNALS) +
        (agent.permissions.delegation ? 3 : 0),
      reviewScore:
        scoreFromSignals(tags, REVIEW_SIGNALS) +
        (tags.has("qa") ? 2 : 0),
    };
  });
}

function inferIntent(
  normalizedPrompt: string,
  mentions: string[],
): { intent: RouterIntent; matchedSignals: string[]; hasMultiStepIntent: boolean } {
  const matchedPlanning = includesAny(normalizedPrompt, PLANNING_SIGNALS);
  const matchedExecution = includesAny(normalizedPrompt, EXECUTION_SIGNALS);
  const matchedResearch = includesAny(normalizedPrompt, RESEARCH_SIGNALS);
  const matchedCollaboration = includesAny(normalizedPrompt, COLLABORATION_SIGNALS);
  const matchedReview = includesAny(normalizedPrompt, REVIEW_SIGNALS);
  const matchedMultiStep = includesAny(normalizedPrompt, MULTI_STEP_SIGNALS);

  if (
    mentions.length > 1 ||
    matchedCollaboration.length > 0 ||
    (matchedMultiStep.length > 0 &&
      [matchedPlanning, matchedExecution, matchedResearch, matchedReview].filter(
        (signals) => signals.length > 0,
      ).length >= 2)
  ) {
    return {
      intent: "collaboration",
      matchedSignals: [
        ...matchedCollaboration,
        ...matchedPlanning,
        ...matchedExecution,
        ...matchedResearch,
        ...matchedReview,
      ],
      hasMultiStepIntent: matchedMultiStep.length > 0,
    };
  }

  if (matchedPlanning.length >= Math.max(matchedExecution.length, matchedResearch.length)) {
    return {
      intent: "planning",
      matchedSignals: matchedPlanning,
      hasMultiStepIntent: matchedMultiStep.length > 0,
    };
  }

  if (matchedResearch.length > matchedExecution.length) {
    return {
      intent: "research",
      matchedSignals: matchedResearch,
      hasMultiStepIntent: matchedMultiStep.length > 0,
    };
  }

  if (matchedExecution.length > 0 || matchedReview.length > 0) {
    return {
      intent: "execution",
      matchedSignals: [...matchedExecution, ...matchedReview],
      hasMultiStepIntent: matchedMultiStep.length > 0,
    };
  }

  return {
    intent: "direct_answer",
    matchedSignals: [],
    hasMultiStepIntent: matchedMultiStep.length > 0,
  };
}

function scoreAgentForIntent(
  agent: RouterAgentLike,
  profile: AgentCapabilityProfile,
  intent: RouterIntent,
  mentions: string[],
  preferredAgentId?: string,
  defaultLeadAgentId?: string,
) {
  let score = 0;
  const reasons: string[] = [];
  const nameSlug = slugify(agent.name);
  const explicitlyMentioned =
    mentions.includes(nameSlug) || mentions.includes(agent.id.toLowerCase());

  if (explicitlyMentioned) {
    score += 120;
    reasons.push("explicit mention");
  }

  if (preferredAgentId && preferredAgentId === agent.id && !explicitlyMentioned) {
    score += 24;
    reasons.push("current thread preference");
  }

  if (intent === "collaboration" && defaultLeadAgentId === agent.id) {
    score += 30;
    reasons.push("default orchestrator");
  }

  if (intent === "planning") {
    score += profile.planningScore * 10;
    if (profile.capabilityTags.includes("architect")) {
      score += 16;
      reasons.push("planning specialist");
    }
  }

  if (intent === "execution") {
    score += profile.executionScore * 10;
    if (profile.capabilityTags.includes("builder")) {
      score += 16;
      reasons.push("execution specialist");
    }
  }

  if (intent === "research") {
    score += profile.researchScore * 10;
    if (profile.capabilityTags.includes("researcher")) {
      score += 16;
      reasons.push("research specialist");
    }
  }

  if (intent === "collaboration") {
    score += profile.collaborationScore * 10;
    if (profile.capabilityTags.includes("orchestration")) {
      score += 10;
      reasons.push("orchestration fit");
    }
  }

  if (intent === "direct_answer") {
    score += 4;
    if (profile.permissions.browser || profile.permissions.terminal) {
      score += 2;
      reasons.push("generalist capability");
    }
  }

  if (profile.reviewScore > 0 && includesAny(agent.objective.toLowerCase(), REVIEW_SIGNALS).length > 0) {
    score += 3;
  }

  return { score, reasons };
}

function buildChannelTitle(prompt: string) {
  const words = normalizePrompt(prompt)
    .split(" ")
    .filter(Boolean)
    .filter(
      (word) =>
        !["please", "can", "you", "help", "with", "for", "the", "a", "an", "and"].includes(
          word.toLowerCase(),
        ),
    )
    .slice(0, 5);

  if (words.length === 0) {
    return "New Channel";
  }

  return words
    .join(" ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildLeadInstruction(
  lane: RouterDecision["lane"],
  leadAgent: RouterAgentLike | undefined,
  prompt: string,
) {
  if (!leadAgent) {
    return prompt;
  }

  if (lane === "channel") {
    return [
      `Lead this collaboration around: "${prompt}"`,
      "Decide the cleanest split of work, keep the room focused, and summarize the room back into one clear answer.",
    ].join("\n\n");
  }

  return [
    `Handle this request directly: "${prompt}"`,
    "Stay in one thread, choose the best immediate next step, and keep the response grounded in the capabilities available to you.",
  ].join("\n\n");
}

function buildCollaboratorInstruction(intent: RouterIntent, prompt: string, agent: RouterAgentLike) {
  const defaultInstruction = `Take the slice of "${prompt}" that best fits your role, and return concrete progress instead of a vague status update.`;

  if (intent === "planning") {
    return `Turn "${prompt}" into a crisp plan, surface edge cases, and make the next implementation slice clearer for the room.`;
  }

  if (intent === "execution") {
    return `Own the implementation-heavy part of "${prompt}", including code, files, terminal work, and concrete verification when possible.`;
  }

  if (intent === "research") {
    return `Gather the strongest outside context for "${prompt}", compare options cleanly, and give the room decision-ready signal.`;
  }

  if (agent.permissions.delegation) {
    return `Support the room on "${prompt}" by clarifying scope, coordinating handoffs, and keeping the collaboration moving.`;
  }

  return defaultInstruction;
}

function buildPromptExpansion(args: {
  prompt: string;
  leadAgent: RouterAgentLike | undefined;
  collaboratorAgents: RouterAgentLike[];
  lane: RouterDecision["lane"];
  intent: RouterIntent;
}): PromptExpansionResult {
  const normalizedPrompt = normalizePrompt(args.prompt);
  const collaboratorBriefs = args.collaboratorAgents.map((agent) => ({
    agentId: agent.id,
    instruction: buildCollaboratorInstruction(args.intent, normalizedPrompt, agent),
  }));

  return {
    normalizedPrompt,
    userFacingPrompt: args.prompt,
    routingSummary:
      args.lane === "channel"
        ? `Open a shared channel for ${args.intent.replace("_", " ")} work and split the task across matched specialists.`
        : `Keep the work in a direct thread and let the lead agent handle it in one lane.`,
    channelTitle: buildChannelTitle(normalizedPrompt),
    leadInstruction: buildLeadInstruction(args.lane, args.leadAgent, normalizedPrompt),
    collaboratorBriefs,
  };
}

export function routeUserRequest(input: RouteRequestInput): {
  decision: RouterDecision;
  capabilityRegistry: AgentCapabilityProfile[];
} {
  const normalizedPrompt = normalizePrompt(input.prompt);
  const capabilityRegistry = buildAgentCapabilityRegistry(input.agents);
  const mentions = extractMentionSlugs(input.prompt);
  const { intent, matchedSignals, hasMultiStepIntent } = inferIntent(
    normalizedPrompt.toLowerCase(),
    mentions,
  );

  const scoredAgents = capabilityRegistry
    .map((profile) => {
      const agent = input.agents.find((candidate) => candidate.id === profile.agentId);
      if (!agent) {
        return { agentId: profile.agentId, score: 0, reasons: ["missing agent"] };
      }

      const scored = scoreAgentForIntent(
        agent,
        profile,
        intent,
        mentions,
        input.preferredAgentId,
        input.defaultLeadAgentId,
      );

      return {
        agentId: profile.agentId,
        score: scored.score,
        reasons: scored.reasons,
      };
    })
    .sort((left, right) => right.score - left.score);

  const preferredAgent = input.agents.find((agent) => agent.id === input.preferredAgentId);
  const defaultLeadAgent = input.agents.find(
    (agent) => agent.id === input.defaultLeadAgentId,
  );

  const shouldOpenChannel =
    intent === "collaboration" ||
    mentions.length > 1 ||
    (hasMultiStepIntent &&
      [intent === "planning", intent === "execution", intent === "research"].filter(Boolean)
        .length > 0 &&
      input.preferredAgentId === input.defaultLeadAgentId);

  const topScoredLead =
    scoredAgents.find((entry) =>
      input.agents.some((agent) => agent.id === entry.agentId),
    )?.agentId ?? preferredAgent?.id ?? input.agents[0]?.id ?? "";
  const hasExplicitMention = mentions.length > 0;

  const leadAgentId = shouldOpenChannel
    ? defaultLeadAgent?.id || topScoredLead
    : hasExplicitMention
      ? topScoredLead
      : preferredAgent?.id || topScoredLead;

  const collaboratorAgentIds = shouldOpenChannel
    ? scoredAgents
        .map((entry) => entry.agentId)
        .filter((agentId) => agentId !== leadAgentId)
        .filter((agentId, index, agentIds) => agentIds.indexOf(agentId) === index)
        .slice(0, 3)
    : [];

  const leadAgent = input.agents.find((agent) => agent.id === leadAgentId);
  const collaboratorAgents = collaboratorAgentIds
    .map((agentId) => input.agents.find((agent) => agent.id === agentId))
    .filter(Boolean) as RouterAgentLike[];

  const promptExpansion = buildPromptExpansion({
    prompt: input.prompt,
    leadAgent,
    collaboratorAgents,
    lane: shouldOpenChannel ? "channel" : "thread",
    intent,
  });

  const reason =
    shouldOpenChannel
      ? `The request looks collaborative: it contains ${intent.replace("_", " ")} signals${mentions.length > 0 ? ", explicit agent mentions," : ""} and benefits from a shared room.`
      : `The request fits a single execution lane, so it stays in-thread with ${leadAgent?.name || "the selected agent"}.`;

  return {
    capabilityRegistry,
    decision: {
      intent,
      lane: shouldOpenChannel ? "channel" : "thread",
      leadAgentId,
      collaboratorAgentIds,
      matchedAgentIds: scoredAgents.slice(0, 4).map((entry) => entry.agentId),
      reason,
      promptExpansion,
      trace: {
        normalizedRequest: normalizedPrompt,
        explicitMentions: mentions,
        signals: matchedSignals,
        preferredAgentId: input.preferredAgentId,
        scoredAgents,
        generatedAt: new Date().toISOString(),
      },
    },
  };
}

export function formatRouterIntentLabel(intent: RouterIntent) {
  return intent.replace(/_/g, " ");
}
