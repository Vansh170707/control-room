import {
  appendThreadMessage,
  getThreadMemory,
  listAgentNotes,
  listAttachedFiles,
  listKnowledge,
  summarizeThread,
  type AgentNote,
  type AttachedFile,
  type KnowledgeEntry,
  type ThreadMemory,
} from "@/lib/agent-memory";
import { sendAgentRuntimeChat, type RuntimeChatMessage } from "@/lib/agent-runtime";

export interface MemoryContextBundle {
  thread?: ThreadMemory;
  notes: AgentNote[];
  knowledge: KnowledgeEntry[];
  files: AttachedFile[];
}

export interface CriticResult {
  verdict: "approved" | "rejected";
  feedback: string;
  attempts: number;
}

export interface ThoughtPlan {
  thought: string;
  json: Record<string, unknown> | null;
  raw: string;
}

export async function loadMemoryContext(agentId: string): Promise<MemoryContextBundle> {
  const [threadResult, notesResult, knowledgeResult, filesResult] = await Promise.all([
    getThreadMemory(agentId),
    listAgentNotes(agentId),
    listKnowledge(agentId),
    listAttachedFiles(agentId),
  ]);

  return {
    thread: threadResult.ok ? threadResult.thread : undefined,
    notes: notesResult.ok ? notesResult.notes ?? [] : [],
    knowledge: knowledgeResult.ok ? knowledgeResult.entries ?? [] : [],
    files: filesResult.ok ? filesResult.files ?? [] : [],
  };
}

export async function persistMemoryMessage(input: {
  agentId: string;
  role: "user" | "assistant" | "system";
  content: string;
  sender: string;
  metadata?: Record<string, unknown>;
}) {
  if (!input.content.trim()) {
    return;
  }

  await appendThreadMessage(input.agentId, {
    role: input.role,
    content: input.content,
    sender: input.sender,
    timestamp: new Date().toISOString(),
    tokens: null,
    metadata: input.metadata ?? {},
  });
}

export async function maybeRefreshThreadSummary(agentId: string, totalMessages: number) {
  if (totalMessages < 12) {
    return null;
  }

  const result = await summarizeThread(agentId);
  return result.ok ? result.summary ?? null : null;
}

export function buildMemoryContextMessage(bundle: MemoryContextBundle): RuntimeChatMessage | null {
  const sections: string[] = [];

  if (bundle.thread?.summary) {
    sections.push(`Thread summary:\n${bundle.thread.summary}`);
  }

  if (bundle.knowledge.length > 0) {
    sections.push(
      [
        "Relevant knowledge:",
        ...bundle.knowledge.slice(0, 4).map((entry) => `- ${entry.title}: ${entry.content.slice(0, 220)}`),
      ].join("\n"),
    );
  }

  if (bundle.notes.length > 0) {
    sections.push(
      [
        "Pinned notes:",
        ...bundle.notes.slice(0, 4).map((note) => `- ${note.title}: ${note.content.slice(0, 220)}`),
      ].join("\n"),
    );
  }

  if (bundle.files.length > 0) {
    sections.push(
      [
        "Attached files already known to memory:",
        ...bundle.files.slice(0, 4).map((file) => `- ${file.name}: ${file.summary || file.path}`),
      ].join("\n"),
    );
  }

  if (sections.length === 0) {
    return null;
  }

  return {
    role: "system",
    content: [
      "Memory context for this agent.",
      "Use it as background context, but prefer the current user turn when they conflict.",
      ...sections,
    ].join("\n\n"),
  };
}

export function extractThoughtPlan(raw: string): ThoughtPlan {
  const thoughtMatch = raw.match(/<thought>([\s\S]*?)<\/thought>/i);
  const thought = thoughtMatch?.[1]?.trim() ?? "";
  const json = extractJsonObject(raw);

  return {
    thought,
    json,
    raw,
  };
}

export function extractJsonObject(raw: string): Record<string, unknown> | null {
  const fencedMatch = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidatePool = [fencedMatch?.[1], raw].filter(Boolean) as string[];

  for (const candidate of candidatePool) {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      continue;
    }

    try {
      return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
    } catch {
      continue;
    }
  }

  return null;
}

export async function requestThoughtPlan(input: {
  agent: Parameters<typeof sendAgentRuntimeChat>[0]["agent"];
  messages: RuntimeChatMessage[];
  retryPrompt?: string;
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await sendAgentRuntimeChat({
      agent: input.agent,
      messages:
        attempt === 0
          ? input.messages
          : [
              ...input.messages,
              {
                role: "user",
                content:
                  input.retryPrompt ||
                  "Your last reply did not include both a <thought>...</thought> block and a valid JSON object. Retry in exactly that format.",
              },
            ],
    });

    if (!response.ok || !response.text) {
      return { ok: false as const, error: response.error || "Planner request failed." };
    }

    const parsed = extractThoughtPlan(response.text);
    if (parsed.thought && parsed.json) {
      return { ok: true as const, parsed };
    }
  }

  return { ok: false as const, error: "Planner returned malformed thought/JSON output twice." };
}

export async function reviewWithCritic(input: {
  agent: Parameters<typeof sendAgentRuntimeChat>[0]["agent"];
  prompt: string;
  candidate: string;
  contextMessages: RuntimeChatMessage[];
}) {
  const criticAgent = {
    ...input.agent,
    systemPrompt: [
      "You are the Critic layer for a multi-agent workspace.",
      "Review the candidate response for correctness, completeness, and whether it matches the user request.",
      'Return JSON only with schema: {"verdict":"approved"|"rejected","feedback":"string"}',
      "Reject when the answer is vague, skips the ask, overclaims execution, or misses obvious next-step reasoning.",
    ].join("\n\n"),
  };

  const result = await sendAgentRuntimeChat({
    agent: criticAgent,
    messages: [
      ...input.contextMessages.slice(-8),
      {
        role: "user",
        content: [
          `User request:\n${input.prompt}`,
          `Candidate response:\n${input.candidate}`,
        ].join("\n\n"),
      },
    ],
  });

  if (!result.ok || !result.text) {
    return {
      verdict: "approved",
      feedback: "Critic unavailable; accepted without additional review.",
    } as const;
  }

  const parsed = extractJsonObject(result.text);
  const verdict =
    parsed?.verdict === "rejected" ? "rejected" : "approved";
  const feedback =
    typeof parsed?.feedback === "string" && parsed.feedback.trim()
      ? parsed.feedback.trim()
      : verdict === "approved"
        ? "Approved."
        : "Revise the answer to better satisfy the request.";

  return { verdict, feedback } as const;
}

export async function runCriticLoop(input: {
  agent: Parameters<typeof sendAgentRuntimeChat>[0]["agent"];
  prompt: string;
  initialCandidate: string;
  contextMessages: RuntimeChatMessage[];
  maxAttempts?: number;
}) {
  const maxAttempts = Math.max(1, Math.min(3, input.maxAttempts ?? 3));
  let candidate = input.initialCandidate;
  let attempts = 1;

  for (; attempts <= maxAttempts; attempts += 1) {
    const critic = await reviewWithCritic({
      agent: input.agent,
      prompt: input.prompt,
      candidate,
      contextMessages: input.contextMessages,
    });

    if (critic.verdict === "approved" || attempts === maxAttempts) {
      return {
        text: candidate,
        critic: {
          verdict: critic.verdict,
          feedback: critic.feedback,
          attempts,
        } satisfies CriticResult,
      };
    }

    const revision = await sendAgentRuntimeChat({
      agent: {
        ...input.agent,
        systemPrompt: [
          input.agent.systemPrompt,
          "A critic rejected the last draft.",
          "Revise the answer using the critic feedback. Keep the answer concise and grounded.",
        ].join("\n\n"),
      },
      messages: [
        ...input.contextMessages.slice(-8),
        {
          role: "user",
          content: [
            `Original request:\n${input.prompt}`,
            `Previous draft:\n${candidate}`,
            `Critic feedback:\n${critic.feedback}`,
            "Revise the answer now.",
          ].join("\n\n"),
        },
      ],
    });

    if (!revision.ok || !revision.text) {
      return {
        text: candidate,
        critic: {
          verdict: "rejected",
          feedback: critic.feedback,
          attempts,
        } satisfies CriticResult,
      };
    }

    candidate = revision.text;
  }

  return {
    text: candidate,
    critic: {
      verdict: "approved",
      feedback: "Approved.",
      attempts,
    } satisfies CriticResult,
  };
}
