export type ToolName =
  | "browser.fetch"
  | "browser.extract"
  | "filesystem.read"
  | "filesystem.write"
  | "filesystem.list"
  | "code.search"
  | "git.status"
  | "git.diff"
  | "git.log"
  | "shell.exec"
  | "http.request"
  | "delegate.task";

export type ToolRiskLevel = "safe" | "low" | "medium" | "high" | "critical";

export interface ToolParameterSchema {
  name: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  required: boolean;
  description: string;
  default?: unknown;
  enum?: string[];
}

export interface ToolDefinition {
  name: ToolName;
  category: "browser" | "filesystem" | "code" | "git" | "shell" | "http" | "delegation";
  description: string;
  riskLevel: ToolRiskLevel;
  requiresApproval: boolean;
  parameters: ToolParameterSchema[];
  responseShape: {
    type: "object";
    properties: Record<string, string>;
  };
}

export interface ToolInvocationRequest {
  tool: ToolName;
  agentId: string;
  parameters: Record<string, unknown>;
  workspacePath?: string;
  sandboxMode?: "none" | "read-only" | "workspace-write";
  approvalToken?: string;
}

export interface ToolInvocationResult {
  ok: boolean;
  tool: ToolName;
  data?: Record<string, unknown>;
  error?: string;
  approvalRequired?: boolean;
  approvalRequestId?: string;
  approvalReasons?: string[];
  durationMs?: number;
}

export interface ToolApprovalRequest {
  id: string;
  tool: ToolName;
  agentId: string;
  agentName: string;
  parameters: Record<string, unknown>;
  riskLevel: ToolRiskLevel;
  reasons: string[];
  preview?: {
    command?: string;
    filePaths?: string[];
    diff?: string;
    url?: string;
    method?: string;
  };
  requestedAt: string;
  expiresAt: string;
}

export interface ToolApprovalResponse {
  approvalRequestId: string;
  action: "approve" | "reject" | "edit";
  editedParameters?: Record<string, unknown>;
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: "browser.fetch",
    category: "browser",
    description: "Fetch a web page and return HTML plus basic metadata.",
    riskLevel: "medium",
    requiresApproval: true,
    parameters: [
      { name: "url", type: "string", required: true, description: "The URL to fetch." },
      { name: "timeout", type: "number", required: false, description: "Timeout in milliseconds.", default: 30000 },
    ],
    responseShape: { type: "object", properties: { url: "string", status: "number", title: "string", html: "string", textExcerpt: "string" } },
  },
  {
    name: "browser.extract",
    category: "browser",
    description: "Fetch a web page and extract readable text for lightweight scraping.",
    riskLevel: "medium",
    requiresApproval: true,
    parameters: [
      { name: "url", type: "string", required: true, description: "The URL to extract from." },
      { name: "maxChars", type: "number", required: false, description: "Maximum extracted characters to return.", default: 12000 },
      { name: "timeout", type: "number", required: false, description: "Timeout in milliseconds.", default: 30000 },
    ],
    responseShape: { type: "object", properties: { url: "string", status: "number", title: "string", text: "string", durationMs: "number" } },
  },
  {
    name: "filesystem.read",
    category: "filesystem",
    description: "Read file contents from the workspace. Returns the file text or a directory listing.",
    riskLevel: "safe",
    requiresApproval: false,
    parameters: [
      { name: "path", type: "string", required: true, description: "File or directory path relative to the workspace root." },
      { name: "encoding", type: "string", required: false, description: "File encoding. Defaults to utf-8.", default: "utf-8", enum: ["utf-8", "ascii", "base64", "hex"] },
      { name: "offset", type: "number", required: false, description: "Line offset to start reading from (1-indexed)." },
      { name: "limit", type: "number", required: false, description: "Maximum number of lines to return." },
    ],
    responseShape: { type: "object", properties: { path: "string", content: "string", size: "number", lines: "number" } },
  },
  {
    name: "filesystem.write",
    category: "filesystem",
    description: "Write or create a file in the workspace. Overwrites existing files unless patch mode is used.",
    riskLevel: "high",
    requiresApproval: true,
    parameters: [
      { name: "path", type: "string", required: true, description: "File path relative to the workspace root." },
      { name: "content", type: "string", required: true, description: "File content to write." },
      { name: "createOnly", type: "boolean", required: false, description: "If true, fail if the file already exists.", default: false },
      { name: "patch", type: "boolean", required: false, description: "If true, content is a unified diff to apply.", default: false },
    ],
    responseShape: { type: "object", properties: { path: "string", created: "boolean", bytesWritten: "number" } },
  },
  {
    name: "filesystem.list",
    category: "filesystem",
    description: "List files and directories in a workspace path.",
    riskLevel: "safe",
    requiresApproval: false,
    parameters: [
      { name: "path", type: "string", required: false, description: "Directory path. Defaults to workspace root.", default: "." },
      { name: "recursive", type: "boolean", required: false, description: "Recurse into subdirectories.", default: false },
      { name: "maxDepth", type: "number", required: false, description: "Maximum recursion depth.", default: 3 },
    ],
    responseShape: { type: "object", properties: { path: "string", entries: "array", totalFiles: "number" } },
  },
  {
    name: "code.search",
    category: "code",
    description: "Search for patterns in workspace code files using regex or literal match.",
    riskLevel: "safe",
    requiresApproval: false,
    parameters: [
      { name: "pattern", type: "string", required: true, description: "Search pattern (regex or literal string)." },
      { name: "path", type: "string", required: false, description: "Directory or file to search. Defaults to workspace root.", default: "." },
      { name: "filePattern", type: "string", required: false, description: "Glob pattern for file names. Defaults to all files.", default: "*" },
      { name: "maxResults", type: "number", required: false, description: "Maximum number of results to return.", default: 50 },
      { name: "caseSensitive", type: "boolean", required: false, description: "Case-sensitive search.", default: false },
    ],
    responseShape: { type: "object", properties: { pattern: "string", results: "array", totalMatches: "number", filesSearched: "number" } },
  },
  {
    name: "git.status",
    category: "git",
    description: "Show the working tree status.",
    riskLevel: "safe",
    requiresApproval: false,
    parameters: [],
    responseShape: { type: "object", properties: { branch: "string", staged: "array", unstaged: "array", untracked: "array", ahead: "number", behind: "number" } },
  },
  {
    name: "git.diff",
    category: "git",
    description: "Show changes between commits, commit and working tree, etc.",
    riskLevel: "safe",
    requiresApproval: false,
    parameters: [
      { name: "cached", type: "boolean", required: false, description: "Show staged changes only.", default: false },
      { name: "path", type: "string", required: false, description: "Limit diff to a specific path." },
      { name: "ref", type: "string", required: false, description: "Git ref to diff against. Defaults to HEAD." },
    ],
    responseShape: { type: "object", properties: { diff: "string", filesChanged: "number", insertions: "number", deletions: "number" } },
  },
  {
    name: "git.log",
    category: "git",
    description: "Show commit logs.",
    riskLevel: "safe",
    requiresApproval: false,
    parameters: [
      { name: "maxCount", type: "number", required: false, description: "Maximum number of commits to return.", default: 20 },
      { name: "path", type: "string", required: false, description: "Limit to commits touching this path." },
      { name: "format", type: "string", required: false, description: "Log format string.", default: "oneline" },
    ],
    responseShape: { type: "object", properties: { commits: "array", total: "number" } },
  },
  {
    name: "shell.exec",
    category: "shell",
    description: "Execute a shell command in the workspace sandbox.",
    riskLevel: "high",
    requiresApproval: true,
    parameters: [
      { name: "command", type: "string", required: true, description: "The shell command to execute." },
      { name: "cwd", type: "string", required: false, description: "Working directory for the command. Defaults to workspace root." },
      { name: "timeout", type: "number", required: false, description: "Timeout in milliseconds.", default: 120000 },
      { name: "env", type: "object", required: false, description: "Additional environment variables for the command." },
    ],
    responseShape: { type: "object", properties: { exitCode: "number", stdout: "string", stderr: "string", durationMs: "number", timedOut: "boolean" } },
  },
  {
    name: "http.request",
    category: "http",
    description: "Make an HTTP request to an external URL.",
    riskLevel: "medium",
    requiresApproval: true,
    parameters: [
      { name: "url", type: "string", required: true, description: "The URL to request." },
      { name: "method", type: "string", required: false, description: "HTTP method.", default: "GET", enum: ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD"] },
      { name: "headers", type: "object", required: false, description: "Request headers." },
      { name: "body", type: "string", required: false, description: "Request body (for POST/PUT/PATCH)." },
      { name: "timeout", type: "number", required: false, description: "Timeout in milliseconds.", default: 30000 },
    ],
    responseShape: { type: "object", properties: { status: "number", statusText: "string", headers: "object", body: "string", durationMs: "number" } },
  },
  {
    name: "delegate.task",
    category: "delegation",
    description: "Delegate a task to another agent in the workspace.",
    riskLevel: "low",
    requiresApproval: false,
    parameters: [
      { name: "assigneeId", type: "string", required: true, description: "Agent ID to delegate to." },
      { name: "title", type: "string", required: true, description: "Task title." },
      { name: "payload", type: "string", required: false, description: "Task instructions or command payload." },
      { name: "executionMode", type: "string", required: false, description: "How the task should execute.", default: "thread", enum: ["thread", "command", "manual"] },
      { name: "priority", type: "string", required: false, description: "Task priority.", default: "medium", enum: ["low", "medium", "high"] },
    ],
    responseShape: { type: "object", properties: { taskId: "string", status: "string", assigneeId: "string" } },
  },
];

export function getToolDefinition(name: ToolName): ToolDefinition | undefined {
  return TOOL_DEFINITIONS.find((tool) => tool.name === name);
}

export function getToolsByCategory(category: ToolDefinition["category"]): ToolDefinition[] {
  return TOOL_DEFINITIONS.filter((tool) => tool.category === category);
}

export function getToolsRequiringApproval(): ToolDefinition[] {
  return TOOL_DEFINITIONS.filter((tool) => tool.requiresApproval);
}

export function isToolAllowedForSandboxMode(
  tool: ToolName,
  sandboxMode: "none" | "read-only" | "workspace-write",
): boolean {
  if (sandboxMode === "none") {
    return tool === "delegate.task";
  }

  const writeTools: ToolName[] = ["filesystem.write", "shell.exec", "http.request"];
  if (sandboxMode === "read-only" && writeTools.includes(tool)) {
    return false;
  }

  return true;
}
