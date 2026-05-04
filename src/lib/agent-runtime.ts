type RuntimeChatRole = "user" | "assistant" | "system";
type RuntimeSandboxMode = "none" | "read-only" | "workspace-write";

export type RunStatus =
  | "queued"
  | "planning"
  | "running"
  | "waiting_for_approval"
  | "blocked"
  | "completed"
  | "failed"
  | "canceled";

export type RunPhase =
  | "queued"
  | "planning"
  | "executing"
  | "waiting_for_approval"
  | "blocked"
  | "completed"
  | "failed"
  | "canceled";

export interface RuntimeAgentPermissions {
  terminal: boolean;
  browser: boolean;
  files: boolean;
  git: boolean;
  delegation: boolean;
  automations?: Record<string, boolean>;
  connectors?: Record<string, boolean>;
}

export interface RuntimeAgentProfile {
  id: string;
  name: string;
  provider: string;
  model: string;
  objective: string;
  systemPrompt: string;
  sandboxMode: RuntimeSandboxMode;
  workspace: string;
  permissions: RuntimeAgentPermissions;
}

export interface RuntimeChatMessage {
  role: RuntimeChatRole;
  content: string;
  sender?: string;
  timestamp?: string;
  attachments?: Array<{
    type: "image";
    url: string;
    mimeType?: string;
    name?: string;
  }>;
}

export interface RuntimeHealth {
  ok: boolean;
  runtime?: string;
  providers?: {
    openai?: boolean;
    anthropic?: boolean;
    openrouter?: boolean;
    gemini?: boolean;
    groq?: boolean;
    nvidia?: boolean;
    githubModels?: boolean;
    browserUse?: boolean;
  };
  auth?: {
    githubDeviceFlow?: {
      configured?: boolean;
      authenticated?: boolean;
      tokenSource?: string;
      scope?: string;
    };
  };
  browserUse?: {
    configured?: boolean;
    baseUrl?: string;
    model?: string;
    maxCostUsd?: string;
  };
  connectors?: Record<string, boolean>;
  connectorSessions?: Record<
    string,
    {
      provider: string;
      connected: boolean;
      authType: string;
      scopes: string[];
      accountLabel: string;
      keyPreview: string;
      updatedAt: string;
      expiresAt: string | null;
    }
  >;
  error?: string;
}

export interface BrowserUseSession {
  id: string;
  status: string;
  liveUrl?: string;
  output?: string;
  error?: string;
  messages?: Array<{
    id?: string;
    role?: string;
    data?: string;
    summary?: string;
    screenshotUrl?: string;
    createdAt?: string;
  }>;
  model?: string;
  totalCostUsd?: string;
  task?: string;
  createdAt?: string;
  updatedAt?: string;
  agentId?: string;
  agentName?: string;
}

export interface RuntimeChatResult {
  ok: boolean;
  text?: string;
  provider?: string;
  model?: string;
  usage?: unknown;
  error?: string;
}

export interface RuntimeExecuteResult {
  ok: boolean;
  runId?: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  durationMs?: number;
  cwd?: string;
  activity?: RuntimeCommandActivity;
  canceled?: boolean;
  error?: string;
  artifacts?: RuntimeArtifact[] | null;
}

export interface RuntimeCommandActivity {
  kind: "sandbox" | "search" | "read" | "git" | "test" | "build" | "install" | "thinking" | "typing" | "delegation" | "browser" | "tool";
  label: string;
  summary?: string;
}

export interface RuntimeCommandRunRecord {
  id: string;
  agentId: string;
  agentName: string;
  command: string;
  cwd: string;
  status: RunStatus;
  phase: RunPhase;
  activity: RuntimeCommandActivity;
  startedAt: string;
  completedAt?: string | null;
  canceledAt?: string | null;
  durationMs?: number | null;
  exitCode?: number | null;
  timedOut?: boolean;
  stdout?: string;
  stderr?: string;
  error?: string;
  retryCount?: number;
  maxRetries?: number;
  parentRunId?: string | null;
  retryOfRunId?: string | null;
  model?: string;
  provider?: string;
  tokenUsage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  } | null;
  toolCalls?: RuntimeToolCall[] | null;
  artifacts?: RuntimeArtifact[] | null;
}

export interface RuntimeToolCall {
  tool: string;
  parameters: Record<string, unknown>;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number | null;
  result?: "success" | "failure" | "approval_required" | "blocked";
}

export interface RuntimeArtifact {
  name: string;
  type: "file" | "url" | "image" | "log" | "diff" | "test_result";
  path?: string;
  url?: string;
  content?: string;
  size?: number;
}

export interface AgentLoopToolCall {
  tool: string;
  parameters: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  result?: "success" | "failure";
}

export interface AgentLoopResult {
  ok: boolean;
  runId?: string;
  agentId?: string;
  agentName?: string;
  status?: "completed" | "failed" | "canceled";
  iterations?: number;
  maxIterations?: number;
  finalText?: string;
  toolCalls?: AgentLoopToolCall[];
  tokenUsage?: { totalTokens?: number };
  durationMs?: number;
  error?: string | null;
}

export interface AgentLoopStreamEvent {
  type:
    | "agent_loop:started"
    | "agent_loop:iteration"
    | "agent_loop:thinking"
    | "agent_loop:tool_call"
    | "agent_loop:tool_result"
    | "agent_loop:tool_error"
    | "agent_loop:tool_blocked"
    | "agent_loop:approval_required"
    | "agent_loop:approval_approved"
    | "agent_loop:approval_rejected"
    | "agent_loop:approval_auto_approved"
    | "agent_loop:max_iterations"
    | "agent_loop:completed"
    | "agent_loop:failed"
    | "completed"
    | "error";
  runId?: string;
  phase?: string;
  iteration?: number;
  maxIterations?: number;
  tool?: string;
  parameters?: Record<string, unknown>;
  ok?: boolean;
  text?: string;
  resultPreview?: string;
  error?: string;
  reasons?: string[];
  preview?: RuntimeCommandActivity;
  approvalRequestId?: string;
  agentId?: string;
  agentName?: string;
  finalText?: string;
  provider?: string;
  usage?: unknown;
  durationMs?: number;
}

export async function executeAgentLoop(input: {
  agent: RuntimeAgentProfile;
  messages: RuntimeChatMessage[];
  maxIterations?: number;
  autoApproveSafe?: boolean;
  timeoutMs?: number;
}): Promise<AgentLoopResult> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/agent/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    return await parseJsonResponse<AgentLoopResult>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Agent loop request failed"),
    };
  }
}

export async function executeAgentLoopStream(
  input: {
    agent: RuntimeAgentProfile;
    messages: RuntimeChatMessage[];
    maxIterations?: number;
    autoApproveSafe?: boolean;
    timeoutMs?: number;
  },
  onEvent: (event: AgentLoopStreamEvent) => void,
): Promise<AgentLoopResult> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/agent/run/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      return await parseJsonResponse<AgentLoopResult>(response);
    }

    if (!response.body) {
      return { ok: false, error: "Agent loop stream body was empty." };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: AgentLoopResult | null = null;

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const event = JSON.parse(trimmed) as AgentLoopStreamEvent;
        onEvent(event);

        if (event.type === "completed") {
          finalResult = {
            ok: Boolean(event.ok),
            runId: event.runId,
            agentId: event.agentId,
            agentName: event.agentName,
            status: event.ok ? "completed" : "failed",
            iterations: event.iteration ?? event.maxIterations,
            maxIterations: event.maxIterations,
            finalText: event.finalText,
            toolCalls: [],
            durationMs: event.durationMs,
            error: event.error ?? null,
          };
        }

        if (event.type === "error") {
          finalResult = {
            ok: false,
            error: event.error || "Agent loop stream failed.",
          };
        }
      }

      if (done) break;
    }

    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer.trim()) as AgentLoopStreamEvent;
        onEvent(event);
        if (event.type === "completed") {
          finalResult = {
            ok: Boolean(event.ok),
            runId: event.runId,
            agentId: event.agentId,
            agentName: event.agentName,
            status: event.ok ? "completed" : "failed",
            iterations: event.iteration ?? event.maxIterations,
            maxIterations: event.maxIterations,
            finalText: event.finalText,
            toolCalls: [],
            durationMs: event.durationMs,
            error: event.error ?? null,
          };
        } else if (event.type === "error") {
          finalResult = { ok: false, error: event.error || "Agent loop stream failed." };
        }
      } catch {}
    }

    return finalResult ?? { ok: false, error: "Agent loop stream ended without completion." };
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Agent loop stream request failed"),
    };
  }
}

export async function cancelAgentLoop(
  runId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/agent/runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    return await parseJsonResponse<{ ok: boolean; error?: string }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to cancel agent loop."),
    };
  }
}

export async function resolveAgentLoopApproval(
  approvalRequestId: string,
  action: "approve" | "reject" | "edit",
  editedParameters?: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/tools/approvals/${encodeURIComponent(approvalRequestId)}?agentLoop=true`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, editedParameters }),
    });

    return await parseJsonResponse<{ ok: boolean; error?: string }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to resolve agent loop approval."),
    };
  }
}

export interface RuntimeExecuteStreamEvent {
  type: "started" | "stdout" | "stderr" | "completed" | "error" | "phase_change" | "tool_call" | "artifact" | "usage";
  runId?: string;
  phase?: RunPhase;
  command?: string;
  chunk?: string;
  ok?: boolean;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  timedOut?: boolean;
  durationMs?: number;
  cwd?: string;
  startedAt?: string;
  completedAt?: string;
  activity?: RuntimeCommandActivity;
  canceled?: boolean;
  error?: string;
  toolCall?: RuntimeToolCall;
  artifact?: RuntimeArtifact;
  artifacts?: RuntimeArtifact[] | null;
  tokenUsage?: RuntimeCommandRunRecord["tokenUsage"];
}

export interface RuntimeSSEEvent {
  id: string;
  type:
    | "run:queued"
    | "run:planning"
    | "run:started"
    | "run:phase_change"
    | "run:tool_call"
    | "run:artifact"
    | "run:stdout"
    | "run:stderr"
    | "run:waiting_for_approval"
    | "run:blocked"
    | "run:completed"
    | "run:failed"
    | "run:canceled"
    | "run:retried"
    | "run:resumed";
  runId: string;
  agentId: string;
  agentName: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface RuntimeGithubDeviceStartResult {
  ok: boolean;
  deviceCode?: string;
  userCode?: string;
  verificationUri?: string;
  verificationUriComplete?: string;
  expiresIn?: number;
  interval?: number;
  scope?: string;
  error?: string;
}

export interface RuntimeGithubDevicePollResult {
  ok: boolean;
  pending?: boolean;
  slowDown?: boolean;
  authenticated?: boolean;
  tokenSource?: string;
  scope?: string;
  updatedAt?: string;
  interval?: number;
  error?: string;
}

const runtimeBaseUrl = import.meta.env.VITE_AGENT_RUNTIME_URL?.replace(/\/$/, "") ?? "";
const cloudChatApiUrl = import.meta.env.VITE_CLOUD_CHAT_API_URL?.trim() || "";
const browserGeminiApiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim() || "";
const browserCloudChatModel = import.meta.env.VITE_CLOUD_CHAT_MODEL?.trim() || "gemini-2.5-flash";
const MAX_CHAT_MESSAGES = 14;
const MAX_CHAT_MESSAGE_CHARS = 6000;
const MAX_CHAT_CONTEXT_CHARS = 36000;

export const hasAgentRuntime = Boolean(runtimeBaseUrl);

function formatRuntimeFetchError(error: unknown, fallback: string) {
  if (error instanceof TypeError && error.message === "Failed to fetch") {
    return runtimeBaseUrl
      ? `Local runtime is not reachable at ${runtimeBaseUrl}. Start it with npm run runtime:dev, then try again.`
      : "Agent runtime URL is not configured.";
  }

  return error instanceof Error ? error.message : fallback;
}

export function getRuntimeFileViewUrl(filePath: string) {
  if (!hasAgentRuntime || !filePath.trim()) {
    return "";
  }

  return `${runtimeBaseUrl}/v1/files/view?path=${encodeURIComponent(filePath)}`;
}

async function parseJsonResponse<T>(response: Response) {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || response.statusText || "Runtime request failed");
  }

  return payload;
}

function sleep(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchWithRetry(url: string, init: RequestInit, attempts = 4) {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await fetch(url, {
        ...init,
        cache: "no-store",
        credentials: "omit",
      });
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to fetch");
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function truncateRuntimeText(value: string, limit = MAX_CHAT_MESSAGE_CHARS) {
  return value.length <= limit
    ? value
    : `${value.slice(0, limit)}\n...[trimmed before model request]`;
}

function sanitizeRuntimeMessages(messages: RuntimeChatMessage[]) {
  let totalChars = 0;
  const kept = messages
    .slice(-MAX_CHAT_MESSAGES)
    .reverse()
    .map((message) => {
      const content = truncateRuntimeText(message.content || "");
      totalChars += content.length;

      return {
        ...message,
        content,
      };
    })
    .filter((message) => message.content.trim());

  while (kept.length > 1 && totalChars > MAX_CHAT_CONTEXT_CHARS) {
    const removed = kept.pop();
    totalChars -= removed?.content.length ?? 0;
  }

  return kept.reverse();
}

function sanitizeRuntimeChatInput(input: {
  agent: RuntimeAgentProfile;
  messages: RuntimeChatMessage[];
}) {
  return {
    ...input,
    messages: sanitizeRuntimeMessages(input.messages),
  };
}

function getCloudChatUrls() {
  const urls = ["/api/chat"];

  if (typeof window !== "undefined") {
    urls.push(`${window.location.origin}/api/chat`);
  }

  urls.push(cloudChatApiUrl);
  urls.push("https://openclaw-control-room.vercel.app/api/chat");

  return uniqueValues(urls);
}

async function fetchCloudChat(input: {
  agent: RuntimeAgentProfile;
  messages: RuntimeChatMessage[];
}) {
  const sanitizedInput = sanitizeRuntimeChatInput(input);
  const errors: string[] = [];

  for (const url of getCloudChatUrls()) {
    try {
      const response = await fetchWithRetry(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sanitizedInput),
      });

      return await parseJsonResponse<RuntimeChatResult>(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown fetch error";
      errors.push(`${url}: ${message}`);
    }
  }

  throw new Error(`Cloud chat request failed. Tried ${errors.join(" | ")}`);
}

function buildBrowserGeminiSystemPrompt(agent: RuntimeAgentProfile) {
  const enabledTools = Object.entries(agent.permissions ?? {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([tool]) => tool)
    .join(", ");

  return [
    agent.systemPrompt?.trim() ||
      `You are ${agent.name}, a specialist inside a personal multi-agent workspace.`,
    agent.objective ? `Current objective: ${agent.objective}` : "",
    enabledTools ? `Enabled capabilities: ${enabledTools}.` : "Enabled capabilities: reasoning only.",
    agent.permissions?.terminal
      ? "You may ask to use the local bridge for terminal/file work, but do not claim you executed commands unless command results are explicitly present in the conversation."
      : "",
    agent.workspace ? `Workspace: ${agent.workspace}` : "",
    "Reply normally as the agent. Do not mention API fallback, bridge internals, Supabase, or Vercel unless the user asks about infrastructure.",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function buildBrowserGeminiContents(messages: RuntimeChatMessage[]) {
  const contents = messages
    .filter((message) => message.role !== "system" && message.content.trim())
    .map((message) => ({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text: message.content.trim() }],
    }));

  return contents.length > 0
    ? contents
    : [{ role: "user", parts: [{ text: "Introduce yourself and ask how you can help." }] }];
}

function extractBrowserGeminiText(payload: unknown) {
  const candidates = Array.isArray((payload as { candidates?: unknown[] })?.candidates)
    ? ((payload as { candidates: Array<{ content?: { parts?: Array<{ text?: string }> } }> }).candidates)
    : [];
  const parts = candidates[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}

async function parseGeminiError(response: Response) {
  const text = await response.text();

  try {
    const payload = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    return (
      (typeof payload.error === "object" ? payload.error?.message : payload.error) ||
      payload.message ||
      text ||
      response.statusText
    );
  } catch {
    return text || response.statusText;
  }
}

async function fetchBrowserGeminiChat(input: {
  agent: RuntimeAgentProfile;
  messages: RuntimeChatMessage[];
}): Promise<RuntimeChatResult> {
  const sanitizedInput = sanitizeRuntimeChatInput(input);

  if (!browserGeminiApiKey) {
    throw new Error("Browser Gemini API key is not configured.");
  }

  const requestedModel = sanitizedInput.agent.model?.trim() || "";
  const requestedProvider = sanitizedInput.agent.provider?.trim().toLowerCase() || "";

  if (!requestedProvider.includes("gemini") && !requestedModel.toLowerCase().startsWith("gemini-")) {
    throw new Error(
      `Browser Gemini fallback skipped because ${sanitizedInput.agent.name} is configured for ${sanitizedInput.agent.provider}/${sanitizedInput.agent.model}.`,
    );
  }

  const model = requestedModel.toLowerCase().startsWith("gemini-")
    ? requestedModel.replace(/^models\//, "")
    : browserCloudChatModel.replace(/^models\//, "") || "gemini-2.5-flash";
  const response = await fetchWithRetry(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(browserGeminiApiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        system_instruction: {
          parts: [{ text: buildBrowserGeminiSystemPrompt(sanitizedInput.agent) }],
        },
        contents: buildBrowserGeminiContents(sanitizedInput.messages),
        generationConfig: {
          maxOutputTokens: 2048,
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Browser Gemini error: ${await parseGeminiError(response)}`);
  }

  const payload = await response.json();
  const text = extractBrowserGeminiText(payload);

  if (!text) {
    throw new Error("Browser Gemini returned an empty response.");
  }

  return {
    ok: true,
    text,
    provider: "gemini-browser-fallback",
    model,
    usage: (payload as { usageMetadata?: unknown }).usageMetadata ?? null,
  } as RuntimeChatResult;
}

export async function getAgentRuntimeHealth(): Promise<RuntimeHealth> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "disabled" };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/health`);
    return await parseJsonResponse<RuntimeHealth>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Runtime health check failed"),
    };
  }
}

export async function createBrowserUseSession(input: {
  task: string;
  agentId?: string;
  agentName?: string;
  model?: string;
  keepAlive?: boolean;
  maxCostUsd?: string;
}): Promise<{ ok: boolean; session?: BrowserUseSession; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/browser-use/sessions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    return await parseJsonResponse<{ ok: boolean; session: BrowserUseSession }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to create Browser Use session."),
    };
  }
}

export async function listBrowserUseSessions(): Promise<{ ok: boolean; sessions?: BrowserUseSession[]; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/browser-use/sessions`);
    return await parseJsonResponse<{ ok: boolean; sessions: BrowserUseSession[] }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to list Browser Use sessions."),
    };
  }
}

export async function getBrowserUseSession(sessionId: string): Promise<{ ok: boolean; session?: BrowserUseSession; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/browser-use/sessions/${encodeURIComponent(sessionId)}`);
    return await parseJsonResponse<{ ok: boolean; session: BrowserUseSession }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to fetch Browser Use session."),
    };
  }
}

export async function stopBrowserUseSession(sessionId: string): Promise<{ ok: boolean; session?: BrowserUseSession; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/browser-use/sessions/${encodeURIComponent(sessionId)}/stop`, {
      method: "POST",
    });
    return await parseJsonResponse<{ ok: boolean; session: BrowserUseSession }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to stop Browser Use session."),
    };
  }
}

export function validateThoughtActionSequence(text: string): string | null {
  const hasToolCallLikeIndicator = /<tool_call>[\s\S]*?<\/tool_call>/i.test(text);

  if (hasToolCallLikeIndicator) {
    const hasValidThought = /<thought>[\s\S]+?<\/thought>/i.test(text);
    if (!hasValidThought) {
      return 'Invalid Sequence: You must provide a <thought> block explaining your reasoning before invoking a tool. Please rewrite your response.';
    }
  }

  return null;
}

function validateChatResult(result: RuntimeChatResult): RuntimeChatResult {
  if (result.ok && result.text) {
    const sequenceError = validateThoughtActionSequence(result.text);
    if (sequenceError) {
      return { ok: false, error: sequenceError };
    }
  }

  return result;
}

async function sendCloudChatWithFallback(input: {
  agent: RuntimeAgentProfile;
  messages: RuntimeChatMessage[];
}): Promise<RuntimeChatResult> {
  try {
    return validateChatResult(await fetchCloudChat(input));
  } catch (error) {
    try {
      return validateChatResult(await fetchBrowserGeminiChat(input));
    } catch (fallbackError) {
      const primaryMessage =
        error instanceof Error ? error.message : "Cloud chat request failed.";
      const fallbackMessage =
        fallbackError instanceof Error ? fallbackError.message : "";

      return {
        ok: false,
        provider: "cloud-chat",
        error: fallbackMessage
          ? `${primaryMessage} ${fallbackMessage}`
          : primaryMessage,
      };
    }
  }
}

export async function sendAgentRuntimeChat(input: {
  agent: RuntimeAgentProfile;
  messages: RuntimeChatMessage[];
}): Promise<RuntimeChatResult> {
  const sanitizedInput = sanitizeRuntimeChatInput(input);

  if (!hasAgentRuntime) {
    return sendCloudChatWithFallback(sanitizedInput);
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sanitizedInput),
    });

    const result = await parseJsonResponse<RuntimeChatResult>(response);

    return validateChatResult(result);
  } catch (error) {
    const cloudResult = await sendCloudChatWithFallback(sanitizedInput);

    if (cloudResult.ok) {
      return cloudResult;
    }

    const runtimeMessage = formatRuntimeFetchError(
      error,
      "Runtime chat request failed",
    );

    return {
      ...cloudResult,
      error: cloudResult.error
        ? `${runtimeMessage} Cloud fallback also failed: ${cloudResult.error}`
        : runtimeMessage,
    };
  }
}

export async function executeAgentRuntimeCommand(input: {
  agent: RuntimeAgentProfile;
  command: string;
  cwd?: string;
  timeoutMs?: number;
}): Promise<RuntimeExecuteResult> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/execute`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    return await parseJsonResponse<RuntimeExecuteResult>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Runtime execute request failed"),
    };
  }
}

export async function executeAgentRuntimeCommandStream(
  input: {
    agent: RuntimeAgentProfile;
    command: string;
    cwd?: string;
    timeoutMs?: number;
  },
  onEvent: (event: RuntimeExecuteStreamEvent) => void,
): Promise<RuntimeExecuteResult> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/execute/stream`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      return await parseJsonResponse<RuntimeExecuteResult>(response);
    }

    if (!response.body) {
      return { ok: false, error: "Runtime stream body was empty." };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: RuntimeExecuteResult | null = null;

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        const event = JSON.parse(trimmed) as RuntimeExecuteStreamEvent;
        onEvent(event);

        if (event.type === "completed") {
          finalResult = {
            ok: Boolean(event.ok),
            runId: event.runId,
            exitCode: event.exitCode,
            stdout: event.stdout,
            stderr: event.stderr,
            timedOut: event.timedOut,
            durationMs: event.durationMs,
            cwd: event.cwd,
            activity: event.activity,
            canceled: event.canceled,
            artifacts: event.artifacts ?? null,
          };
        }

        if (event.type === "error") {
          finalResult = {
            ok: false,
            error: event.error || "Runtime stream failed.",
          };
        }
      }

      if (done) {
        break;
      }
    }

    if (buffer.trim()) {
      const event = JSON.parse(buffer.trim()) as RuntimeExecuteStreamEvent;
      onEvent(event);
      if (event.type === "completed") {
        finalResult = {
          ok: Boolean(event.ok),
          runId: event.runId,
          exitCode: event.exitCode,
          stdout: event.stdout,
          stderr: event.stderr,
          timedOut: event.timedOut,
          durationMs: event.durationMs,
          cwd: event.cwd,
          activity: event.activity,
          canceled: event.canceled,
          artifacts: event.artifacts ?? null,
        };
      } else if (event.type === "error") {
        finalResult = {
          ok: false,
          error: event.error || "Runtime stream failed.",
        };
      }
    }

    return finalResult ?? { ok: false, error: "Runtime stream ended without a completion event." };
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Runtime execute stream request failed"),
    };
  }
}

export async function listAgentRuntimeRuns(input?: {
  agentId?: string;
  limit?: number;
}): Promise<{ ok: boolean; runs?: RuntimeCommandRunRecord[]; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const params = new URLSearchParams();
    if (input?.agentId) {
      params.set("agentId", input.agentId);
    }
    if (typeof input?.limit === "number") {
      params.set("limit", String(input.limit));
    }

    const query = params.toString();
    const response = await fetch(`${runtimeBaseUrl}/v1/runs${query ? `?${query}` : ""}`);
    return await parseJsonResponse<{ ok: boolean; runs: RuntimeCommandRunRecord[] }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to list runtime runs."),
    };
  }
}

export async function getAgentRuntimeRun(
  runId: string,
): Promise<{ ok: boolean; run?: RuntimeCommandRunRecord; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/runs/${encodeURIComponent(runId)}`);
    return await parseJsonResponse<{ ok: boolean; run: RuntimeCommandRunRecord }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to fetch runtime run."),
    };
  }
}

export async function cancelAgentRuntimeRun(
  runId: string,
): Promise<{ ok: boolean; run?: RuntimeCommandRunRecord; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/runs/${encodeURIComponent(runId)}/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    return await parseJsonResponse<{ ok: boolean; run?: RuntimeCommandRunRecord; error?: string }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to cancel runtime run."),
    };
  }
}

export async function startGithubCopilotDeviceAuth(): Promise<RuntimeGithubDeviceStartResult> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/auth/github/device/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    return await parseJsonResponse<RuntimeGithubDeviceStartResult>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to start GitHub device auth."),
    };
  }
}

export async function pollGithubCopilotDeviceAuth(
  deviceCode: string,
): Promise<RuntimeGithubDevicePollResult> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/auth/github/device/poll`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deviceCode }),
    });

    return await parseJsonResponse<RuntimeGithubDevicePollResult>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to poll GitHub device auth."),
    };
  }
}

export async function logoutGithubCopilotAuth(): Promise<{ ok: boolean; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/auth/github/logout`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({}),
    });

    return await parseJsonResponse<{ ok: boolean; error?: string }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to clear GitHub auth."),
    };
  }
}

export async function listConnectorAuth(): Promise<{
  ok: boolean;
  connectors?: Record<string, boolean>;
  sessions?: RuntimeHealth["connectorSessions"];
  error?: string;
}> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/connectors`);
    return await parseJsonResponse<{
      ok: boolean;
      connectors: Record<string, boolean>;
      sessions: RuntimeHealth["connectorSessions"];
    }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to list connector auth."),
    };
  }
}

export async function startConnectorOAuth(provider: string): Promise<{
  ok: boolean;
  provider?: string;
  authUrl?: string;
  redirectUri?: string;
  scopes?: string[];
  connectorProvider?: string;
  configured?: boolean;
  error?: string;
}> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(
      `${runtimeBaseUrl}/v1/connectors/${encodeURIComponent(provider)}/oauth/start`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    return await parseJsonResponse<{
      ok: boolean;
      provider: string;
      authUrl: string;
      redirectUri: string;
      scopes: string[];
      connectorProvider?: string;
      configured?: boolean;
      error?: string;
    }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, `Failed to start ${provider} OAuth.`),
    };
  }
}

export async function storeConnectorToken(input: {
  provider: string;
  token: string;
  label?: string;
  scopes?: string[];
}): Promise<{ ok: boolean; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(
      `${runtimeBaseUrl}/v1/connectors/${encodeURIComponent(input.provider)}/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      },
    );
    return await parseJsonResponse<{ ok: boolean; error?: string }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, `Failed to save ${input.provider} token.`),
    };
  }
}

export async function disconnectConnector(provider: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(
      `${runtimeBaseUrl}/v1/connectors/${encodeURIComponent(provider)}/disconnect`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      },
    );
    return await parseJsonResponse<{ ok: boolean; error?: string }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, `Failed to disconnect ${provider}.`),
    };
  }
}

export interface RuntimeGmailMessage {
  id: string;
  threadId: string;
  from: string;
  subject: string;
  date: string;
  labels: string[];
  snippet: string;
}

export async function fetchLatestGmailMessages(input?: {
  limit?: number;
  query?: string;
}): Promise<{
  ok: boolean;
  accountLabel?: string;
  count?: number;
  messages?: RuntimeGmailMessage[];
  error?: string;
}> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  const params = new URLSearchParams();
  params.set("limit", `${input?.limit ?? 5}`);
  if (input?.query?.trim()) {
    params.set("q", input.query.trim());
  }

  try {
    const response = await fetch(
      `${runtimeBaseUrl}/v1/connectors/gmail/latest?${params.toString()}`,
      { cache: "no-store", credentials: "omit" },
    );
    return await parseJsonResponse<{
      ok: boolean;
      accountLabel: string;
      count: number;
      messages: RuntimeGmailMessage[];
      error?: string;
    }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to read Gmail through Composio."),
    };
  }
}

export function subscribeToRuntimeEvents(input: {
  agentId?: string;
  onEvent: (event: RuntimeSSEEvent) => void;
  onError?: (error: Error) => void;
  reconnectIntervalMs?: number;
}): { unsubscribe: () => void } {
  if (!hasAgentRuntime) {
    return { unsubscribe: () => {} };
  }

  let active = true;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  const reconnectMs = input.reconnectIntervalMs ?? 3000;

  function connect() {
    if (!active) return;

    const params = new URLSearchParams();
    if (input.agentId) params.set("agentId", input.agentId);
    const query = params.toString();
    const url = `${runtimeBaseUrl}/v1/events${query ? `?${query}` : ""}`;

    const eventSource = new EventSource(url);

    eventSource.onmessage = (messageEvent) => {
      try {
        const event = JSON.parse(messageEvent.data) as RuntimeSSEEvent;
        input.onEvent(event);
      } catch {}
    };

    eventSource.onerror = () => {
      eventSource.close();
      if (active) {
        if (input.onError) {
          input.onError(new Error("SSE connection lost. Reconnecting..."));
        }
        reconnectTimer = setTimeout(connect, reconnectMs);
      }
    };

    return eventSource;
  }

  const eventSource = connect();

  return {
    unsubscribe: () => {
      active = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (eventSource) eventSource.close();
    },
  };
}

export async function retryRun(
  runId: string,
): Promise<{ ok: boolean; run?: RuntimeCommandRunRecord; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/runs/${encodeURIComponent(runId)}/retry`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    return await parseJsonResponse<{ ok: boolean; run?: RuntimeCommandRunRecord; error?: string }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to retry run."),
    };
  }
}

export async function resumeRun(
  runId: string,
): Promise<{ ok: boolean; run?: RuntimeCommandRunRecord; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/runs/${encodeURIComponent(runId)}/resume`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    return await parseJsonResponse<{ ok: boolean; run?: RuntimeCommandRunRecord; error?: string }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to resume run."),
    };
  }
}

export async function getRunTimeline(
  runId: string,
): Promise<{ ok: boolean; events?: RuntimeSSEEvent[]; error?: string }> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/runs/${encodeURIComponent(runId)}/timeline`);
    return await parseJsonResponse<{ ok: boolean; events: RuntimeSSEEvent[] }>(response);
  } catch (error) {
    return {
      ok: false,
      error: formatRuntimeFetchError(error, "Failed to get run timeline."),
    };
  }
}
