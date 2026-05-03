/**
 * Default agent definitions, delegations, channels, and builder presets.
 * Extracted from App.tsx lines 1260-1692.
 */
import type {
  AgentPermissions,
  CollaborationChannel,
  DelegationTask,
  SandboxMode,
  WorkspaceAgent,
} from "@/types";
import {
  BUILDER_AGENT_ID,
  DEFAULT_AGENT_WORKSPACE,
  DEFAULT_CHANNEL_LEAD_AGENT_ID,
  GALAXY_AGENT_ID,
} from "@/constants";

// ── Codex-style Builder defaults ─────────────────────────────────────

export const codexStyleBuilderDefaults = {
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

// ── Default custom agents ────────────────────────────────────────────

export const defaultCustomAgents: WorkspaceAgent[] = [
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
    provider: "Modal",
    model: "zai-org/GLM-5.1-FP8",
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

// ── Default delegations ──────────────────────────────────────────────

export const defaultDelegations: DelegationTask[] = [
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

// ── Default channels ─────────────────────────────────────────────────

export const defaultChannels: CollaborationChannel[] = [
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
