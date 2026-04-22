export type WorkspaceDeviceStatus = "starting" | "running" | "stopped" | "error" | "creating";

export interface WorkspacePort {
  port: number;
  protocol: "http" | "https" | "tcp";
  service: string;
  url: string;
  isPublic: boolean;
}

export interface WorkspaceProcess {
  pid: number;
  command: string;
  cwd: string;
  startedAt: string;
  status: "running" | "stopped" | "crashed";
  exitCode: number | null;
  port?: number;
}

export interface WorkspaceFileInfo {
  path: string;
  name: string;
  type: "file" | "directory" | "symlink";
  size: number;
  modifiedAt: string;
  permissions: string;
}

export interface WorkspaceDevice {
  id: string;
  workspaceId: string;
  name: string;
  path: string;
  status: WorkspaceDeviceStatus;
  createdAt: string;
  lastStartedAt: string | null;
  lastStoppedAt: string | null;
  ports: WorkspacePort[];
  processes: WorkspaceProcess[];
  installedPackages: string[];
  environmentVariables: Record<string, string>;
  diskUsageBytes: number;
  diskLimitBytes: number;
  runtime: {
    type: "local" | "docker" | "remote";
    os: string;
    shell: string;
    nodeVersion: string | null;
    pythonVersion: string | null;
  };
  sessions: WorkspaceSession[];
}

export interface WorkspaceSession {
  id: string;
  agentId: string;
  agentName: string;
  startedAt: string;
  lastActiveAt: string;
  commandCount: number;
  filesChanged: number;
  status: "active" | "idle" | "ended";
}

export interface CreateWorkspaceDeviceInput {
  workspaceId: string;
  name: string;
  path: string;
  runtime?: {
    type?: "local" | "docker" | "remote";
    shell?: string;
  };
  environmentVariables?: Record<string, string>;
  diskLimitBytes?: number;
}

export interface WorkspaceDeviceActionResult {
  ok: boolean;
  device?: WorkspaceDevice;
  error?: string;
}

const runtimeBaseUrl = import.meta.env.VITE_AGENT_RUNTIME_URL?.replace(/\/$/, "") ?? "";
const hasDeviceRuntime = Boolean(runtimeBaseUrl);

async function parseJsonResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || response.statusText || "Device runtime request failed");
  }
  return payload;
}

export async function getWorkspaceDevice(
  workspacePath: string,
): Promise<WorkspaceDeviceActionResult> {
  if (!hasDeviceRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const params = new URLSearchParams({ path: workspacePath });
    const response = await fetch(`${runtimeBaseUrl}/v1/workspace/device?${params}`);
    return await parseJsonResponse<WorkspaceDeviceActionResult>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to get workspace device." };
  }
}

export async function listWorkspaceDevices(): Promise<{ ok: boolean; devices?: WorkspaceDevice[]; error?: string }> {
  if (!hasDeviceRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/workspace/devices`);
    return await parseJsonResponse<{ ok: boolean; devices: WorkspaceDevice[] }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to list workspace devices." };
  }
}

export async function refreshWorkspaceDevice(
  workspacePath: string,
): Promise<WorkspaceDeviceActionResult> {
  if (!hasDeviceRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/workspace/device/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: workspacePath }),
    });
    return await parseJsonResponse<WorkspaceDeviceActionResult>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to refresh workspace device." };
  }
}

export async function startWorkspaceDevice(
  workspacePath: string,
): Promise<WorkspaceDeviceActionResult> {
  if (!hasDeviceRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/workspace/device/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: workspacePath }),
    });
    return await parseJsonResponse<WorkspaceDeviceActionResult>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to start workspace device." };
  }
}

export async function stopWorkspaceDevice(
  workspacePath: string,
): Promise<WorkspaceDeviceActionResult> {
  if (!hasDeviceRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const response = await fetch(`${runtimeBaseUrl}/v1/workspace/device/stop`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: workspacePath }),
    });
    return await parseJsonResponse<WorkspaceDeviceActionResult>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to stop workspace device." };
  }
}

export async function getWorkspaceFiles(
  workspacePath: string,
  dir: string = ".",
): Promise<{ ok: boolean; files?: WorkspaceFileInfo[]; path?: string; error?: string }> {
  if (!hasDeviceRuntime) {
    return { ok: false, error: "Runtime URL is not configured." };
  }

  try {
    const params = new URLSearchParams({ path: workspacePath, dir });
    const response = await fetch(`${runtimeBaseUrl}/v1/workspace/device/files?${params}`);
    return await parseJsonResponse<{ ok: boolean; files: WorkspaceFileInfo[]; path: string }>(response);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Failed to list workspace files." };
  }
}
