export type SecretProvider = "openai" | "anthropic" | "gemini" | "groq" | "openrouter" | "github" | "copilot" | "custom";

export type SecretStatus = "active" | "expired" | "invalid" | "unconfigured" | "refreshing";

export interface ProviderSecret {
  id: string;
  provider: SecretProvider;
  label: string;
  keyPreview: string;
  status: SecretStatus;
  lastValidatedAt: string | null;
  expiresAt: string | null;
  scopes: string[];
  isOAuth: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProviderHealthCheck {
  provider: SecretProvider;
  ok: boolean;
  latencyMs: number | null;
  model: string | null;
  error: string | null;
  checkedAt: string;
}

export interface AgentAccountBinding {
  agentId: string;
  provider: SecretProvider;
  secretId: string;
  model: string;
  isDefault: boolean;
}

export interface UpsertSecretInput {
  provider: SecretProvider;
  label?: string;
  apiKey: string;
  scopes?: string[];
  expiresAt?: string;
}

export interface StoreSecretResult {
  ok: boolean;
  secret?: ProviderSecret;
  error?: string;
}

export interface DeleteSecretResult {
  ok: boolean;
  error?: string;
}

export interface ValidateSecretResult {
  ok: boolean;
  status: SecretStatus;
  healthCheck?: ProviderHealthCheck;
  error?: string;
}

export interface AgentVariable {
  key: string;
  value: string;
  isSecret: boolean;
  description: string;
  updatedAt: string;
}

export interface AgentAccountPanel {
  agentId: string;
  provider: SecretProvider;
  model: string;
  secretId: string;
  health: ProviderHealthCheck | null;
  variables: AgentVariable[];
}

const runtimeBaseUrl = import.meta.env.VITE_AGENT_RUNTIME_URL?.replace(/\/$/, "") ?? "";
const hasSecretsRuntime = Boolean(runtimeBaseUrl);

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || response.statusText || "Secrets request failed");
  }
  return payload;
}

export async function listSecrets(): Promise<{ ok: boolean; secrets?: ProviderSecret[]; error?: string }> {
  if (!hasSecretsRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/secrets`);
    return await parseJsonResponse<{ ok: boolean; secrets: ProviderSecret[] }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to list secrets." };
  }
}

export async function storeSecret(input: UpsertSecretInput): Promise<StoreSecretResult> {
  if (!hasSecretsRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/secrets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return await parseJsonResponse<StoreSecretResult>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to store secret." };
  }
}

export async function deleteSecret(secretId: string): Promise<DeleteSecretResult> {
  if (!hasSecretsRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/secrets/${encodeURIComponent(secretId)}`, {
      method: "DELETE",
    });
    return await parseJsonResponse<DeleteSecretResult>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to delete secret." };
  }
}

export async function validateSecret(secretId: string): Promise<ValidateSecretResult> {
  if (!hasSecretsRuntime) {
    return { ok: false, status: "unconfigured", error: "Runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/secrets/${encodeURIComponent(secretId)}/validate`, {
      method: "POST",
    });
    return await parseJsonResponse<ValidateSecretResult>(response);
  } catch (error) {
    return { ok: false, status: "invalid", error: error instanceof Error ? error.message : "Validation failed." };
  }
}

export async function getProviderHealth(): Promise<{ ok: boolean; checks?: ProviderHealthCheck[]; error?: string }> {
  if (!hasSecretsRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/secrets/health`);
    return await parseJsonResponse<{ ok: boolean; checks: ProviderHealthCheck[] }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to check provider health." };
  }
}

export async function listAgentBindings(agentId?: string): Promise<{ ok: boolean; bindings?: AgentAccountBinding[]; error?: string }> {
  if (!hasSecretsRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const params = new URLSearchParams();
    if (agentId) params.set("agentId", agentId);
    const query = params.toString();
    const response = await fetch(`${runtimeBaseUrl}/v1/secrets/bindings${query ? `?${query}` : ""}`);
    return await parseJsonResponse<{ ok: boolean; bindings: AgentAccountBinding[] }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to list bindings." };
  }
}

export async function setAgentBinding(input: AgentAccountBinding): Promise<{ ok: boolean; error?: string }> {
  if (!hasSecretsRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/secrets/bindings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return await parseJsonResponse<{ ok: boolean; error?: string }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to set binding." };
  }
}

export async function listAgentVariables(agentId: string): Promise<{ ok: boolean; variables?: AgentVariable[]; error?: string }> {
  if (!hasSecretsRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/secrets/variables/${encodeURIComponent(agentId)}`);
    return await parseJsonResponse<{ ok: boolean; variables: AgentVariable[] }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to list variables." };
  }
}

export async function setAgentVariable(agentId: string, key: string, value: string, isSecret: boolean = false, description: string = ""): Promise<{ ok: boolean; error?: string }> {
  if (!hasSecretsRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/secrets/variables/${encodeURIComponent(agentId)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key, value, isSecret, description }),
    });
    return await parseJsonResponse<{ ok: boolean; error?: string }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to set variable." };
  }
}

export async function deleteAgentVariable(agentId: string, key: string): Promise<{ ok: boolean; error?: string }> {
  if (!hasSecretsRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/secrets/variables/${encodeURIComponent(agentId)}/${encodeURIComponent(key)}`, {
      method: "DELETE",
    });
    return await parseJsonResponse<{ ok: boolean; error?: string }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to delete variable." };
  }
}

export function getProviderDisplayName(provider: SecretProvider): string {
  const names: Record<SecretProvider, string> = {
    openai: "OpenAI",
    anthropic: "Anthropic",
    gemini: "Google Gemini",
    groq: "Groq",
    openrouter: "OpenRouter",
    github: "GitHub Models",
    copilot: "GitHub Copilot",
    custom: "Custom Provider",
  };
  return names[provider] || provider;
}

export function getProviderStatusColor(status: SecretStatus): string {
  const colors: Record<SecretStatus, string> = {
    active: "text-[#34d399]",
    expired: "text-[#fbbf24]",
    invalid: "text-[#f87171]",
    unconfigured: "text-[#6e7681]",
    refreshing: "text-[#818cf8]",
  };
  return colors[status] || "text-[#6e7681]";
}
