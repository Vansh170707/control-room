import {
  type ToolName,
  type ToolInvocationRequest,
  type ToolInvocationResult,
  type ToolApprovalRequest,
  type ToolApprovalResponse,
  type ToolDefinition,
  TOOL_DEFINITIONS,
} from "@/lib/tool-definitions";

const runtimeBaseUrl = import.meta.env.VITE_AGENT_RUNTIME_URL?.replace(/\/$/, "") ?? "";

export const hasToolRuntime = Boolean(runtimeBaseUrl);

export function parseToolCallJSON(rawLlmResponse: string): ToolInvocationRequest | { ok: false; error: string } {
  const startMatch = rawLlmResponse.match(/```json\s*/i);
  if (!startMatch) {
    return { ok: false, error: 'Correct the JSON formatting. Ensure the tool call is inside a ```json block.' };
  }
  
  const startIndex = startMatch.index! + startMatch[0].length;
  const endMatch = rawLlmResponse.lastIndexOf('```');
  
  if (endMatch === -1 || endMatch <= startIndex) {
    return { ok: false, error: 'Correct the JSON formatting. The JSON block must be closed with ```.' };
  }
  
  const jsonSubstring = rawLlmResponse.slice(startIndex, endMatch).trim();
  
  try {
    const parsed = JSON.parse(jsonSubstring);
    return parsed as ToolInvocationRequest;
  } catch (error) {
    return { ok: false, error: 'Correct the JSON formatting. JSON.parse failed on the extracted content.' };
  }
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error || response.statusText || "Tool runtime request failed");
  }

  return payload;
}

export async function listTools(): Promise<{ ok: boolean; tools?: ToolDefinition[]; error?: string }> {
  if (!hasToolRuntime) {
    return { ok: true, tools: TOOL_DEFINITIONS };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/tools`);
    return await parseJsonResponse<{ ok: boolean; tools: ToolDefinition[] }>(response);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to list tools.",
    };
  }
}

const DANGER_ZONE = [
  "rm -rf /",
  "mkfs",
  "chmod -R 777",
  ".ssh",
  "sudo "
];

function checkLocalGuardrails(input: ToolInvocationRequest): ToolInvocationResult | null {
  if (input.tool === "shell.exec") {
    const command = (input.parameters as any)?.command || "";
    if (DANGER_ZONE.some(pattern => command.includes(pattern))) {
      return {
        ok: false,
        tool: input.tool,
        approvalRequired: true,
        approvalRequestId: `local-guardrail-${Date.now()}`,
        approvalReasons: ["SENSITIVE_ACTION_REQUIRED: Command contains restricted/destructive keywords. Execution paused for Human-in-the-Loop approval."],
      };
    }
  }
  return null;
}

export async function invokeTool(input: ToolInvocationRequest): Promise<ToolInvocationResult> {
  const guardrailHit = checkLocalGuardrails(input);
  if (guardrailHit) return guardrailHit;

  if (!hasToolRuntime) {
    return { ok: false, tool: input.tool, error: "Tool runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/tools/${encodeURIComponent(input.tool)}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    return await parseJsonResponse<ToolInvocationResult>(response);
  } catch (error) {
    return {
      ok: false,
      tool: input.tool,
      error: error instanceof Error ? error.message : "Tool invocation failed.",
    };
  }
}

export async function invokeToolStream(
  input: ToolInvocationRequest,
  onEvent: (event: ToolStreamEvent) => void,
): Promise<ToolInvocationResult> {
  const guardrailHit = checkLocalGuardrails(input);
  if (guardrailHit) {
    onEvent({
      type: "approval_required",
      tool: input.tool,
      approvalRequestId: guardrailHit.approvalRequestId!,
      reasons: guardrailHit.approvalReasons!,
    });
    return guardrailHit;
  }

  if (!hasToolRuntime) {
    return { ok: false, tool: input.tool, error: "Tool runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/tools/${encodeURIComponent(input.tool)}/invoke/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      return await parseJsonResponse<ToolInvocationResult>(response);
    }

    if (!response.body) {
      return { ok: false, tool: input.tool, error: "Tool stream body was empty." };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finalResult: ToolInvocationResult | null = null;

    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        const event = JSON.parse(trimmed) as ToolStreamEvent;
        onEvent(event);

        if (event.type === "completed") {
          finalResult = event.result;
        }
        if (event.type === "error") {
          finalResult = { ok: false, tool: input.tool, error: event.error };
        }
        if (event.type === "approval_required") {
          finalResult = {
            ok: false,
            tool: input.tool,
            approvalRequired: true,
            approvalRequestId: event.approvalRequestId,
            approvalReasons: event.reasons,
          };
        }
      }

      if (done) break;
    }

    if (buffer.trim()) {
      const event = JSON.parse(buffer.trim()) as ToolStreamEvent;
      onEvent(event);
      if (event.type === "completed") {
        finalResult = event.result;
      } else if (event.type === "error") {
        finalResult = { ok: false, tool: input.tool, error: event.error };
      } else if (event.type === "approval_required") {
        finalResult = {
          ok: false,
          tool: input.tool,
          approvalRequired: true,
          approvalRequestId: event.approvalRequestId,
          approvalReasons: event.reasons,
        };
      }
    }

    return finalResult ?? { ok: false, tool: input.tool, error: "Tool stream ended without completion." };
  } catch (error) {
    return {
      ok: false,
      tool: input.tool,
      error: error instanceof Error ? error.message : "Tool invocation stream failed.",
    };
  }
}

export async function resolveToolApproval(
  response: ToolApprovalResponse,
): Promise<{ ok: boolean; result?: ToolInvocationResult; error?: string }> {
  if (!hasToolRuntime) {
    return { ok: false, error: "Tool runtime URL is not configured." };
  }

  try {
    const result = await fetch(`${runtimeBaseUrl}/v1/tools/approvals/${encodeURIComponent(response.approvalRequestId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(response),
    });

    return await parseJsonResponse<{ ok: boolean; result?: ToolInvocationResult; error?: string }>(result);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to resolve tool approval.",
    };
  }
}

export async function getPendingToolApprovals(
  agentId?: string,
): Promise<{ ok: boolean; approvals?: ToolApprovalRequest[]; error?: string }> {
  if (!hasToolRuntime) {
    return { ok: false, error: "Tool runtime URL is not configured." };
  }

  try {
    const params = new URLSearchParams();
    if (agentId) params.set("agentId", agentId);

    const query = params.toString();
    const response = await fetch(`${runtimeBaseUrl}/v1/tools/approvals${query ? `?${query}` : ""}`);
    return await parseJsonResponse<{ ok: boolean; approvals: ToolApprovalRequest[] }>(response);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to fetch pending approvals.",
    };
  }
}

export type ToolStreamEvent =
  | { type: "started"; tool: ToolName; agentId: string; timestamp: string }
  | { type: "progress"; tool: ToolName; message: string; percentage?: number }
  | { type: "stdout"; tool: ToolName; chunk: string }
  | { type: "stderr"; tool: ToolName; chunk: string }
  | { type: "approval_required"; tool: ToolName; approvalRequestId: string; reasons: string[]; preview?: ToolApprovalRequest["preview"] }
  | { type: "completed"; tool: ToolName; result: ToolInvocationResult }
  | { type: "error"; tool: ToolName; error: string };
