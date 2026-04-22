export type TriggerType = "schedule" | "webhook" | "repo_push" | "repo_pr_opened" | "repo_pr_merged" | "manual";
export type AutomationStatus = "active" | "paused" | "disabled" | "error";

export interface AutomationTrigger {
  type: TriggerType;
  config: Record<string, unknown>;
}

export interface ScheduleConfig {
  cron: string;
  timezone: string;
  enabled: boolean;
}

export interface WebhookConfig {
  path: string;
  secret: string;
  method: "POST" | "GET";
  headers: Record<string, string>;
}

export interface RepoEventConfig {
  repository: string;
  branch: string;
  events: string[];
}

export interface Automation {
  id: string;
  name: string;
  agentId: string;
  agentName: string;
  trigger: AutomationTrigger;
  action: {
    type: "chat" | "command" | "tool_invocation" | "delegation";
    payload: Record<string, unknown>;
  };
  status: AutomationStatus;
  lastRunAt: string | null;
  lastRunId: string | null;
  lastRunStatus: string | null;
  runCount: number;
  errorCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRun {
  id: string;
  automationId: string;
  agentId: string;
  triggerType: TriggerType;
  triggeredAt: string;
  completedAt: string | null;
  status: string;
  runId: string | null;
  error: string | null;
  durationMs: number | null;
}

export interface CreateAutomationInput {
  name: string;
  agentId: string;
  trigger: AutomationTrigger;
  action: Automation["action"];
}

const runtimeBaseUrl = import.meta.env.VITE_AGENT_RUNTIME_URL?.replace(/\/$/, "") ?? "";
const hasAutomationRuntime = Boolean(runtimeBaseUrl);

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || response.statusText || "Automation request failed");
  }
  return payload;
}

export async function listAutomations(): Promise<{ ok: boolean; automations?: Automation[]; error?: string }> {
  if (!hasAutomationRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/automations`);
    return await parseJsonResponse<{ ok: boolean; automations: Automation[] }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to list automations." };
  }
}

export async function createAutomation(input: CreateAutomationInput): Promise<{ ok: boolean; automation?: Automation; error?: string }> {
  if (!hasAutomationRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/automations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return await parseJsonResponse<{ ok: boolean; automation: Automation }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to create automation." };
  }
}

export async function updateAutomation(automationId: string, updates: Partial<Pick<Automation, "name" | "trigger" | "action" | "status">>): Promise<{ ok: boolean; automation?: Automation; error?: string }> {
  if (!hasAutomationRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/automations/${encodeURIComponent(automationId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    return await parseJsonResponse<{ ok: boolean; automation: Automation }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to update automation." };
  }
}

export async function deleteAutomation(automationId: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasAutomationRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/automations/${encodeURIComponent(automationId)}`, {
      method: "DELETE",
    });
    return await parseJsonResponse<{ ok: boolean; error?: string }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to delete automation." };
  }
}

export async function triggerAutomation(automationId: string): Promise<{ ok: boolean; run?: AutomationRun; error?: string }> {
  if (!hasAutomationRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/automations/${encodeURIComponent(automationId)}/trigger`, {
      method: "POST",
    });
    return await parseJsonResponse<{ ok: boolean; run: AutomationRun }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to trigger automation." };
  }
}

export async function listAutomationRuns(automationId: string): Promise<{ ok: boolean; runs?: AutomationRun[]; error?: string }> {
  if (!hasAutomationRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }
  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/automations/${encodeURIComponent(automationId)}/runs`);
    return await parseJsonResponse<{ ok: boolean; runs: AutomationRun[] }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to list automation runs." };
  }
}

export function getTriggerTypeLabel(type: TriggerType): string {
  const labels: Record<TriggerType, string> = {
    schedule: "Scheduled",
    webhook: "Webhook",
    repo_push: "Repo Push",
    repo_pr_opened: "PR Opened",
    repo_pr_merged: "PR Merged",
    manual: "Manual",
  };
  return labels[type] || type;
}

export function getTriggerTypeIcon(type: TriggerType): string {
  const icons: Record<TriggerType, string> = {
    schedule: "⏰",
    webhook: "🔗",
    repo_push: "📦",
    repo_pr_opened: "🔀",
    repo_pr_merged: "✅",
    manual: "👆",
  };
  return icons[type] || "⚡";
}
