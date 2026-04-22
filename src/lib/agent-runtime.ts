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
  };
  error?: string;
}

export interface BrowserUseSession {
  id: string;
  status: string;
  liveUrl?: string;
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

export const hasAgentRuntime = Boolean(runtimeBaseUrl);

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
      error: error instanceof Error ? error.message : "Runtime health check failed",
    };
  }
}

export async function createBrowserUseSession(input: {
  task: string;
  agentId?: string;
  agentName?: string;
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
      error: error instanceof Error ? error.message : "Failed to create Browser Use session.",
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
      error: error instanceof Error ? error.message : "Failed to list Browser Use sessions.",
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
      error: error instanceof Error ? error.message : "Failed to fetch Browser Use session.",
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
      error: error instanceof Error ? error.message : "Failed to stop Browser Use session.",
    };
  }
}

export function validateThoughtActionSequence(text: string): string | null {
  const hasToolCallLikeIndicator = /```(?:json)?\s*[\s\S]*?```/i.test(text) || /<tool_call>[\s\S]*?<\/tool_call>/i.test(text);

  if (hasToolCallLikeIndicator) {
    const hasValidThought = /<thought>[\s\S]+?<\/thought>/i.test(text);
    if (!hasValidThought) {
      return 'Invalid Sequence: You must provide a <thought> block explaining your reasoning before invoking a tool. Please rewrite your response.';
    }
  }

  return null;
}

export async function sendAgentRuntimeChat(input: {
  agent: RuntimeAgentProfile;
  messages: RuntimeChatMessage[];
}): Promise<RuntimeChatResult> {
  if (!hasAgentRuntime) {
    return { ok: false, error: "Agent runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    const result = await parseJsonResponse<RuntimeChatResult>(response);

    if (result.ok && result.text) {
      const sequenceError = validateThoughtActionSequence(result.text);
      if (sequenceError) {
        return { ok: false, error: sequenceError };
      }
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Runtime chat request failed",
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
      error: error instanceof Error ? error.message : "Runtime execute request failed",
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
      error: error instanceof Error ? error.message : "Runtime execute stream request failed",
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
      error: error instanceof Error ? error.message : "Failed to list runtime runs.",
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
      error: error instanceof Error ? error.message : "Failed to fetch runtime run.",
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
      error: error instanceof Error ? error.message : "Failed to cancel runtime run.",
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
      error: error instanceof Error ? error.message : "Failed to start GitHub device auth.",
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
      error: error instanceof Error ? error.message : "Failed to poll GitHub device auth.",
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
      error: error instanceof Error ? error.message : "Failed to clear GitHub auth.",
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
      error: error instanceof Error ? error.message : "Failed to retry run.",
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
      error: error instanceof Error ? error.message : "Failed to resume run.",
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
      error: error instanceof Error ? error.message : "Failed to get run timeline.",
    };
  }
}
