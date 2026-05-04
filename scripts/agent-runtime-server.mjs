#!/usr/bin/env node

import { execSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { resolve, dirname, extname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { config as loadEnv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

loadEnv({ path: resolve(rootDir, ".env.runtime.local"), quiet: true });
loadEnv({ path: resolve(rootDir, ".env.local"), override: false, quiet: true });
loadEnv({ path: resolve(rootDir, ".env.agent.local"), override: false, quiet: true });

const host = process.env.CONTROL_ROOM_RUNTIME_HOST || "127.0.0.1";
const port = Number(process.env.CONTROL_ROOM_RUNTIME_PORT || 8787);
const requestLimitBytes = Number(process.env.CONTROL_ROOM_RUNTIME_REQUEST_LIMIT_BYTES || 512_000);
const defaultTimeoutMs = Number(process.env.CONTROL_ROOM_RUNTIME_TIMEOUT_MS || 120_000);
const oauthPollBaseIntervalSeconds = Number(process.env.CONTROL_ROOM_RUNTIME_OAUTH_POLL_INTERVAL_SECONDS || 5);
const maxRetainedCommandRuns = Number(process.env.CONTROL_ROOM_RUNTIME_MAX_RETAINED_RUNS || 60);
const browserUseApiKey = process.env.BROWSER_USE_API_KEY?.trim() || "";
const browserUseBaseUrl = (process.env.BROWSER_USE_BASE_URL?.trim() || "https://api.browser-use.com/api/v3").replace(/\/$/, "");
const browserUseModel = process.env.BROWSER_USE_MODEL?.trim() || "bu-max";
const browserUseMaxCostUsd = process.env.BROWSER_USE_MAX_COST_USD?.trim() || "1.00";
const composioBaseUrl = (process.env.COMPOSIO_BASE_URL?.trim() || "https://backend.composio.dev/api/v3.1").replace(/\/$/, "");
const composioUserId = process.env.COMPOSIO_USER_ID?.trim() || "vansh";

// Offline-Safe Fetch Interceptor: Prevents ENOTFOUND crashes when running natively offline
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  try {
    return await originalFetch(url, options);
  } catch (err) {
    if (err.code === "ENOTFOUND" || err.message.includes("ENOTFOUND") || err.message.includes("fetch failed")) {
      log(`[Offline Interceptor] Prevented crash on unreachable network call to: ${url}`);
      return {
        ok: false,
        status: 503,
        json: async () => ({ error: "App running in Native Local offline mode. Network call bypassed." }),
        text: async () => "App running in Native Local offline mode. Network call bypassed."
      };
    }
    throw err;
  }
};

const runtimeState = {
  githubOauthToken: "",
  githubOauthScope: "",
  githubOauthTokenType: "",
  githubOauthUpdatedAt: "",
  copilotApiToken: "",
  copilotApiTokenExpiresAt: 0,
  connectorSessions: {},
  commandRuns: [],
  browserUseSessions: [],
};

const activeCommandProcesses = new Map();

const RUN_STATUSES = new Set(["queued", "planning", "running", "waiting_for_approval", "blocked", "completed", "failed", "canceled"]);
const RUN_PHASES = new Set(["queued", "planning", "executing", "waiting_for_approval", "blocked", "completed", "failed", "canceled"]);

const eventSubscribers = new Set();
const runTimelines = new Map();
const maxTimelineEvents = 200;

const workspaceDevices = new Map();
const agentMemoryStore = new Map();
const agentNotesStore = new Map();
const agentKnowledgeStore = new Map();
const agentFileAttachments = new Map();
const automationsStore = new Map();
const automationRunsStore = new Map();
const scheduledTimers = new Map();
const THREAD_SUMMARY_TOKEN_THRESHOLD = 8000;

// ---------------------------------------------------------------------------
// Module 8 — Semantic Search: TF-IDF ranking (pure JS, no dependencies)
// ---------------------------------------------------------------------------

function tokenize(text) {
  return (text || "").toLowerCase().match(/[a-z0-9]+/g) || [];
}

function tfidfRank(query, entries, fields) {
  if (!query || entries.length === 0) return entries;

  const queryTerms = new Set(tokenize(query));
  if (queryTerms.size === 0) return entries;

  // Count term frequency across all docs (IDF denominator)
  const docFreq = {};
  for (const entry of entries) {
    const text = fields.map((f) => entry[f] || "").join(" ");
    const terms = new Set(tokenize(text));
    for (const term of terms) {
      docFreq[term] = (docFreq[term] || 0) + 1;
    }
  }

  const N = entries.length;

  const scored = entries.map((entry) => {
    const text = fields.map((f) => entry[f] || "").join(" ");
    const terms = tokenize(text);
    const tf = {};
    for (const term of terms) tf[term] = (tf[term] || 0) + 1;

    let score = 0;
    for (const qTerm of queryTerms) {
      const termTf = (tf[qTerm] || 0) / Math.max(terms.length, 1);
      const idf = Math.log((N + 1) / ((docFreq[qTerm] || 0) + 1));
      score += termTf * idf;
    }
    return { entry, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.entry);
}

// Phase 3 state
const phase3ApprovalQueue = [];
const phase3TrustPolicies = new Map();

// Phase 4 state
let phase4UserProfile = {
  techStack: [],
  codingStyle: "clean, well-commented",
  preferredLanguage: "TypeScript",
  workflowNotes: "",
  timezone: "UTC",
  updatedAt: new Date().toISOString(),
};
const phase4LearningEvents = [];
const phase4ReflectionsByAgent = new Map();
const phase4BlueprintRegistry = [];

function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

function getOrCreateThread(agentId) {
  if (!agentMemoryStore.has(agentId)) {
    agentMemoryStore.set(agentId, {
      threadId: `thread_${randomUUID()}`,
      agentId,
      messages: [],
      summary: null,
      summaryGeneratedAt: null,
      totalTokens: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return agentMemoryStore.get(agentId);
}

function autoSummarizeIfNeeded(agentId) {
  const thread = agentMemoryStore.get(agentId);
  if (!thread || thread.messages.length < 20) return;

  const totalTokens = thread.messages.reduce(
    (sum, msg) => sum + estimateTokens(msg.content),
    0,
  );
  if (totalTokens < THREAD_SUMMARY_TOKEN_THRESHOLD) return;

  const olderMessages = thread.messages.slice(0, -5);
  if (olderMessages.length === 0) return;

  const summaryParts = olderMessages.map((msg) => {
    const prefix =
      msg.role === "user"
        ? "User"
        : msg.role === "assistant"
          ? "Assistant"
          : "System";
    return `[${prefix}]: ${msg.content.slice(0, 200)}`;
  });

  thread.summary = `Auto-summarized context (${olderMessages.length} messages):\n${summaryParts.join("\n")}`;
  thread.summaryGeneratedAt = new Date().toISOString();
  thread.messages = thread.messages.slice(-5);
  thread.updatedAt = new Date().toISOString();
}

function getOrCreateWorkspaceDevice(workspacePath) {
  const resolvedPath = resolve(workspacePath || process.cwd());
  const existing = workspaceDevices.get(resolvedPath);

  if (existing) {
    existing.lastActiveAt = new Date().toISOString();
    return existing;
  }

  let diskUsage = 0;
  try {
    const stats = statSync(resolvedPath);
    diskUsage = stats.size || 0;
  } catch {}

  const device = {
    id: `device_${randomUUID()}`,
    workspaceId: "default",
    name: resolvedPath.split("/").pop() || "workspace",
    path: resolvedPath,
    status: "running",
    createdAt: new Date().toISOString(),
    lastStartedAt: new Date().toISOString(),
    lastStoppedAt: null,
    ports: [],
    processes: [],
    installedPackages: [],
    environmentVariables: {},
    diskUsageBytes: diskUsage,
    diskLimitBytes: Number(process.env.CONTROL_ROOM_WORKSPACE_DISK_LIMIT_BYTES || 500_000_000),
    runtime: {
      type: "local",
      os: process.platform,
      shell: process.env.SHELL || "/bin/zsh",
      nodeVersion: process.version,
      pythonVersion: null,
    },
    sessions: [],
    activePorts: new Map(),
  };

  workspaceDevices.set(resolvedPath, device);

  log(`Created workspace device: ${device.name} at ${resolvedPath}`);

  return device;
}

async function refreshWorkspaceDeviceInfo(device) {
  try {
    const nodeVersion = execSync("node --version", { cwd: device.path, encoding: "utf-8", timeout: 5000 }).trim();
    device.runtime.nodeVersion = nodeVersion;
  } catch {}

  try {
    const pythonVersion = execSync("python3 --version 2>/dev/null || python --version 2>/dev/null", { cwd: device.path, encoding: "utf-8", timeout: 5000 }).trim();
    device.runtime.pythonVersion = pythonVersion;
  } catch {}

  try {
    const diskOutput = execSync(`du -sk "${device.path}" 2>/dev/null || echo 0`, { cwd: device.path, encoding: "utf-8", timeout: 10000 }).trim();
    const diskKb = Number(diskOutput.split("\t")[0]) || 0;
    device.diskUsageBytes = diskKb * 1024;
  } catch {}

  try {
    if (device.path.includes("node_modules") === false) {
      const pkgJsonPath = resolve(device.path, "package.json");
      try {
        const pkgContent = readFileSync(pkgJsonPath, "utf-8");
        const pkg = JSON.parse(pkgContent);
        const deps = Object.keys(pkg.dependencies || {});
        const devDeps = Object.keys(pkg.devDependencies || {});
        device.installedPackages = [...deps, ...devDeps];
      } catch {}
    }
  } catch {}

  try {
    const listeningPorts = execSync("lsof -iTCP -sTCP:LISTEN -P -n 2>/dev/null | grep LISTEN || true", {
      encoding: "utf-8",
      timeout: 5000,
    }).trim();

    const ports = [];
    for (const line of listeningPorts.split("\n").filter(Boolean)) {
      const match = line.match(/:(\d+)\s/);
      if (match) {
        const port = Number(match[1]);
        if (port > 1024 && port < 65536) {
          const existing = ports.find((p) => p.port === port);
          if (!existing) {
            ports.push({
              port,
              protocol: "http",
              service: "unknown",
              url: `http://localhost:${port}`,
              isPublic: false,
            });
          }
        }
      }
    }
    device.ports = ports;
  } catch {}

  return device;
}

function serializeWorkspaceDevice(device) {
  if (!device) {
    return null;
  }

  return {
    ...device,
    activePorts: Array.from(device.activePorts.entries()).map(([port, details]) => ({
      port: Number(port),
      ...(details || {}),
    })),
  };
}

function emitRuntimeEvent(eventType, runId, agentId, agentName, data) {
  const event = {
    id: `evt_${randomUUID()}`,
    type: eventType,
    runId,
    agentId,
    agentName,
    timestamp: new Date().toISOString(),
    data: data || {},
  };

  if (runId) {
    if (!runTimelines.has(runId)) {
      runTimelines.set(runId, []);
    }
    const timeline = runTimelines.get(runId);
    timeline.push(event);
    if (timeline.length > maxTimelineEvents) {
      timeline.splice(0, timeline.length - maxTimelineEvents);
    }
  }

  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const subscriber of eventSubscribers) {
    try {
      subscriber.write(payload);
    } catch {}
  }
}

const copilotSessionPath = resolve(rootDir, ".copilot-session.json");
const connectorSessionsPath = resolve(rootDir, ".connector-sessions.json");
const automationsStorePath = resolve(rootDir, ".automations-store.json");
const pendingConnectorOAuth = new Map();

function loadCopilotSession() {
  try {
    const data = JSON.parse(readFileSync(copilotSessionPath, "utf-8"));
    if (data?.githubOauthToken) {
      runtimeState.githubOauthToken = data.githubOauthToken;
      runtimeState.githubOauthScope = data.githubOauthScope || "";
      runtimeState.githubOauthTokenType = data.githubOauthTokenType || "bearer";
      runtimeState.githubOauthUpdatedAt = data.githubOauthUpdatedAt || "";
      log("Restored Copilot OAuth session from .copilot-session.json");
    }
  } catch {
    // No saved session, that's fine
  }
}

function saveCopilotSession() {
  try {
    writeFileSync(copilotSessionPath, JSON.stringify({
      githubOauthToken: runtimeState.githubOauthToken,
      githubOauthScope: runtimeState.githubOauthScope,
      githubOauthTokenType: runtimeState.githubOauthTokenType,
      githubOauthUpdatedAt: runtimeState.githubOauthUpdatedAt,
    }, null, 2), "utf-8");
  } catch (err) {
    log(`Warning: could not save Copilot session: ${err.message}`);
  }
}

function loadConnectorSessions() {
  try {
    const data = JSON.parse(readFileSync(connectorSessionsPath, "utf-8"));
    if (data && typeof data === "object") {
      runtimeState.connectorSessions = data;
      log("Restored connector OAuth/token sessions from .connector-sessions.json");
    }
  } catch {
    // No saved connector sessions yet.
  }
}

function saveConnectorSessions() {
  try {
    writeFileSync(
      connectorSessionsPath,
      JSON.stringify(runtimeState.connectorSessions, null, 2),
      "utf-8",
    );
  } catch (err) {
    log(`Warning: could not save connector sessions: ${err.message}`);
  }
}

function loadAutomationState() {
  try {
    const data = JSON.parse(readFileSync(automationsStorePath, "utf-8"));
    const automations = Array.isArray(data?.automations) ? data.automations : [];
    const runsByAutomation = data?.runsByAutomation || {};
    automationsStore.clear();
    automationRunsStore.clear();
    for (const automation of automations) {
      if (automation?.id) {
        automationsStore.set(automation.id, automation);
      }
    }
    for (const [automationId, runs] of Object.entries(runsByAutomation)) {
      if (Array.isArray(runs)) {
        automationRunsStore.set(automationId, runs);
      }
    }
    if (automations.length > 0) {
      log(`Restored ${automations.length} automation(s) from .automations-store.json`);
    }
  } catch {
    // No saved automations yet.
  }
}

function saveAutomationState() {
  try {
    writeFileSync(
      automationsStorePath,
      JSON.stringify(
        {
          automations: Array.from(automationsStore.values()),
          runsByAutomation: Object.fromEntries(automationRunsStore.entries()),
        },
        null,
        2,
      ),
      "utf-8",
    );
  } catch (err) {
    log(`Warning: could not save automations: ${err.message}`);
  }
}

function publicConnectorSessions() {
  return Object.fromEntries(
    Object.entries(runtimeState.connectorSessions || {}).map(([key, value]) => [
      key,
      {
        provider: key,
        connected: Boolean(
          value?.accessToken ||
            value?.apiKey ||
            (value?.authType === "composio" && value?.composioConnectedAccountId),
        ),
        authType: value?.authType || "token",
        scopes: value?.scopes || [],
        accountLabel:
          value?.accountLabel ||
          value?.teamName ||
          value?.workspaceName ||
          value?.composioToolkit ||
          "",
        keyPreview: value?.keyPreview || "",
        updatedAt: value?.updatedAt || "",
        expiresAt: value?.expiresAt || null,
      },
    ]),
  );
}

const blockedCommandPatterns = [
  /\brm\s+-rf\s+\/\b/i,
  /\bsudo\b/i,
  /\bshutdown\b/i,
  /\breboot\b/i,
  /\bmkfs\b/i,
  /\bdd\b/i,
  /\bchmod\s+-R\s+777\b/i,
  /\bchown\b/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-fd\b/i,
];

const readOnlyCommands = new Set([
  "pwd",
  "ls",
  "cat",
  "head",
  "tail",
  "sed",
  "rg",
  "find",
  "git",
  "wc",
  "stat",
  "which",
  "echo",
]);

function log(message) {
  process.stdout.write(`[runtime] ${message}\n`);
}

function corsHeaders(extraHeaders = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Private-Network": "true",
    ...extraHeaders,
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json",
    ...corsHeaders(),
  });
  response.end(JSON.stringify(payload));
}

function sendBinary(response, statusCode, contentType, buffer) {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": Buffer.byteLength(buffer),
    ...corsHeaders(),
  });
  response.end(buffer);
}

function getMimeTypeForPath(filePath) {
  const extension = extname(filePath).toLowerCase();
  if (extension === ".pdf") return "application/pdf";
  if (extension === ".png") return "image/png";
  if (extension === ".jpg" || extension === ".jpeg") return "image/jpeg";
  if (extension === ".gif") return "image/gif";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".json") return "application/json";
  if (extension === ".txt" || extension === ".md") return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

function isAllowedArtifactPath(filePath) {
  const resolvedPath = resolve(filePath);
  const homeDir = resolve(process.env.HOME || "/Users/vanshsehrawat");
  return resolvedPath.startsWith(homeDir) || resolvedPath.startsWith(rootDir);
}

function extractArtifactsFromCommandResult(command, cwd, stdout, stderr) {
  const combined = `${stdout || ""}\n${stderr || ""}`;
  const artifactPaths = new Set();
  const markerPattern = /^ARTIFACT_FILE:\s*(.+)$/gm;

  for (const match of combined.matchAll(markerPattern)) {
    if (match[1]) {
      artifactPaths.add(match[1].trim());
    }
  }

  const outputArgMatch = command.match(/--output\s+['"]?([^'"\n]+\.pdf)['"]?/i);
  if (outputArgMatch?.[1]) {
    artifactPaths.add(outputArgMatch[1].trim());
  }

  const artifacts = [];
  for (const artifactPath of artifactPaths) {
    const resolvedPath = resolve(cwd || process.cwd(), artifactPath);
    if (!isAllowedArtifactPath(resolvedPath) || !existsSync(resolvedPath)) {
      continue;
    }

    try {
      const stats = statSync(resolvedPath);
      if (!stats.isFile()) {
        continue;
      }

      artifacts.push({
        name: basename(resolvedPath),
        type: extname(resolvedPath).toLowerCase() === ".pdf" ? "file" : "file",
        path: resolvedPath,
        size: stats.size,
      });
    } catch {}
  }

  return artifacts;
}

function writeNdjsonHeaders(response) {
  response.writeHead(200, {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    ...corsHeaders(),
    "X-Accel-Buffering": "no",
  });
}

function writeNdjsonEvent(response, payload) {
  response.write(`${JSON.stringify(payload)}\n`);
}

function readJson(request) {
  return new Promise((resolvePromise, rejectPromise) => {
    let rawBody = "";

    request.on("data", (chunk) => {
      rawBody += chunk;

      if (rawBody.length > requestLimitBytes) {
        rejectPromise(new Error("Request body too large"));
        request.destroy();
      }
    });

    request.on("end", () => {
      try {
        resolvePromise(rawBody ? JSON.parse(rawBody) : {});
      } catch (error) {
        rejectPromise(new Error("Invalid JSON body"));
      }
    });

    request.on("error", rejectPromise);
  });
}

function providerAvailability() {
  return {
    openai: Boolean(process.env.OPENAI_API_KEY),
    anthropic: Boolean(process.env.ANTHROPIC_API_KEY),
    openrouter: Boolean(process.env.OPENROUTER_API_KEY),
    gemini: Boolean(process.env.GEMINI_API_KEY),
    groq: Boolean(process.env.GROQ_API_KEY),
    nvidia: Boolean(process.env.NVIDIA_API_KEY),
    modal: Boolean(process.env.MODAL_API_KEY),
    githubModels: Boolean(resolveGitHubModelsToken().token),
    browserUse: Boolean(browserUseApiKey),
  };
}

function connectorAvailability() {
  const sessions = runtimeState.connectorSessions || {};
  const composioConnected = (provider) =>
    Boolean(
      sessions[provider]?.authType === "composio" &&
        sessions[provider]?.composioConnectedAccountId,
    );
  const hasGitHubToken = Boolean(
    process.env.GITHUB_TOKEN?.trim() ||
      process.env.GITHUB_MODELS_TOKEN?.trim() ||
      runtimeState.githubOauthToken,
  );
  const hasGoogleOAuth = Boolean(
    sessions.google?.accessToken ||
    process.env.GOOGLE_ACCESS_TOKEN?.trim() ||
      process.env.GMAIL_ACCESS_TOKEN?.trim() ||
      (process.env.GOOGLE_CLIENT_ID?.trim() &&
        process.env.GOOGLE_CLIENT_SECRET?.trim()),
  );

  return {
    localBridge: true,
    browser: Boolean(browserUseApiKey),
    github: hasGitHubToken || composioConnected("github"),
    gmail: hasGoogleOAuth || composioConnected("gmail"),
    googleDrive: hasGoogleOAuth || composioConnected("googleDrive"),
    googleCalendar: hasGoogleOAuth || composioConnected("googleCalendar"),
    slack: Boolean(composioConnected("slack") || sessions.slack?.accessToken || process.env.SLACK_BOT_TOKEN?.trim()),
    notion: Boolean(composioConnected("notion") || sessions.notion?.accessToken || process.env.NOTION_API_KEY?.trim()),
    vercel: Boolean(composioConnected("vercel") || sessions.vercel?.apiKey || process.env.VERCEL_TOKEN?.trim()),
    supabase: Boolean(
      sessions.supabase?.apiKey ||
      process.env.VITE_SUPABASE_URL?.trim() ||
        process.env.SUPABASE_URL?.trim(),
    ),
    webhook: true,
    composio: Boolean(getComposioApiKey()),
  };
}

const composioConnectorToolkits = {
  github: "GITHUB",
  gmail: "GMAIL",
  googleDrive: "GOOGLEDRIVE",
  googleCalendar: "GOOGLECALENDAR",
  slack: "SLACK",
  notion: "NOTION",
  vercel: "VERCEL",
};

function getComposioApiKey() {
  return (
    process.env.COMPOSIO_API_KEY?.trim() ||
    runtimeState.connectorSessions?.composio?.apiKey ||
    ""
  );
}

function isComposioConnector(provider) {
  return Boolean(composioConnectorToolkits[provider]);
}

async function composioRequest(path, options = {}) {
  const apiKey = getComposioApiKey();
  if (!apiKey) {
    throw new Error("COMPOSIO_API_KEY is missing. Add it to .env.runtime.local or save it in Connector Hub.");
  }

  const response = await fetch(`${composioBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.message ||
      payload?.error ||
      response.statusText ||
      "Composio request failed.";
    throw new Error(message);
  }
  return payload;
}

async function ensureComposioAuthConfig(provider) {
  const toolkit = composioConnectorToolkits[provider];
  if (!toolkit) {
    throw new Error(`${provider} is not mapped to a Composio toolkit yet.`);
  }

  const existing = runtimeState.connectorSessions?.[provider]?.composioAuthConfigId;
  if (existing) {
    return existing;
  }

  try {
    const listed = await composioRequest(
      `/auth_configs?toolkit_slug=${encodeURIComponent(toolkit)}&is_composio_managed=true&limit=10`,
      { method: "GET" },
    );
    const found = (listed.items || []).find(
      (item) =>
        item?.id &&
        item?.toolkit?.slug?.toUpperCase?.() === toolkit &&
        item?.status !== "DISABLED",
    );
    if (found?.id) {
      runtimeState.connectorSessions[provider] = {
        ...(runtimeState.connectorSessions[provider] || {}),
        provider,
        authType: "composio",
        composioToolkit: toolkit,
        composioAuthConfigId: found.id,
        accountLabel: `${toolkit} via Composio`,
        updatedAt: new Date().toISOString(),
      };
      saveConnectorSessions();
      return found.id;
    }
  } catch (err) {
    log(`Composio auth config lookup for ${provider} will create a new config: ${err.message}`);
  }

  const created = await composioRequest("/auth_configs", {
    method: "POST",
    body: JSON.stringify({
      toolkit: { slug: toolkit },
      auth_config: {
        type: "use_composio_managed_auth",
        credentials: {},
        restrict_to_following_tools: [],
      },
    }),
  });
  const authConfigId = created?.auth_config?.id || created?.id;
  if (!authConfigId) {
    throw new Error(`Composio did not return an auth config id for ${toolkit}.`);
  }

  runtimeState.connectorSessions[provider] = {
    ...(runtimeState.connectorSessions[provider] || {}),
    provider,
    authType: "composio",
    composioToolkit: toolkit,
    composioAuthConfigId: authConfigId,
    accountLabel: `${toolkit} via Composio`,
    updatedAt: new Date().toISOString(),
  };
  saveConnectorSessions();
  return authConfigId;
}

function composioCallbackUrl(provider) {
  return `http://${host}:${port}/v1/connectors/composio/callback?provider=${encodeURIComponent(provider)}`;
}

async function startComposioConnector(provider) {
  const toolkit = composioConnectorToolkits[provider];
  const authConfigId = await ensureComposioAuthConfig(provider);
  const alias = `control-room-${provider}-${composioUserId}`.replace(/[^a-zA-Z0-9_-]/g, "-");
  const link = await composioRequest("/connected_accounts/link", {
    method: "POST",
    body: JSON.stringify({
      auth_config_id: authConfigId,
      user_id: composioUserId,
      alias,
      callback_url: composioCallbackUrl(provider),
    }),
  });

  runtimeState.connectorSessions[provider] = {
    ...(runtimeState.connectorSessions[provider] || {}),
    provider,
    authType: "composio",
    composioToolkit: toolkit,
    composioAuthConfigId: authConfigId,
    composioConnectedAccountId: link.connected_account_id || runtimeState.connectorSessions[provider]?.composioConnectedAccountId || "",
    accountLabel: `${toolkit} via Composio`,
    updatedAt: new Date().toISOString(),
    expiresAt: link.expires_at || null,
  };
  saveConnectorSessions();

  return {
    ok: true,
    provider,
    authUrl: link.redirect_url,
    redirectUri: composioCallbackUrl(provider),
    scopes: [],
    connectorProvider: "composio",
  };
}

async function refreshComposioConnector(provider, connectedAccountId = "") {
  const session = runtimeState.connectorSessions[provider] || {};
  const accountId = connectedAccountId || session.composioConnectedAccountId;
  if (!accountId) {
    return connectorAuthStatus(provider);
  }

  const account = await composioRequest(`/connected_accounts/${encodeURIComponent(accountId)}`, {
    method: "GET",
  });
  runtimeState.connectorSessions[provider] = {
    ...session,
    provider,
    authType: "composio",
    composioToolkit: account?.toolkit?.slug?.toUpperCase?.() || session.composioToolkit || composioConnectorToolkits[provider],
    composioAuthConfigId: account?.auth_config?.id || session.composioAuthConfigId || "",
    composioConnectedAccountId: account?.id || accountId,
    composioStatus: account?.status || "",
    accountLabel: account?.alias || account?.name || `${provider} via Composio`,
    updatedAt: new Date().toISOString(),
    expiresAt: session.expiresAt || null,
  };
  saveConnectorSessions();
  return connectorAuthStatus(provider);
}

async function composioProxy(connectedAccountId, endpoint, method = "GET", body = undefined) {
  if (!connectedAccountId) {
    throw new Error("No Composio connected account id is saved for this connector.");
  }
  return await composioRequest("/tools/execute/proxy", {
    method: "POST",
    body: JSON.stringify({
      connected_account_id: connectedAccountId,
      endpoint,
      method,
      ...(body === undefined ? {} : { body }),
    }),
  });
}

function extractHeader(headers, name) {
  const match = (headers || []).find(
    (header) => `${header?.name || ""}`.toLowerCase() === name.toLowerCase(),
  );
  return match?.value || "";
}

function encodeBase64Url(value) {
  return Buffer.from(value, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function buildGmailRfc822(parameters = {}) {
  const to = `${parameters.to || ""}`.trim();
  const subject = `${parameters.subject || ""}`.trim();
  const body = `${parameters.body || ""}`;
  const cc = `${parameters.cc || ""}`.trim();
  const bcc = `${parameters.bcc || ""}`.trim();

  if (!to) {
    throw new Error("A recipient email is required.");
  }
  if (!subject) {
    throw new Error("An email subject is required.");
  }
  if (!body.trim()) {
    throw new Error("An email body is required.");
  }

  return {
    to,
    subject,
    raw: [
      `To: ${to}`,
      cc ? `Cc: ${cc}` : "",
      bcc ? `Bcc: ${bcc}` : "",
      `Subject: ${subject}`,
      "Content-Type: text/plain; charset=UTF-8",
      "MIME-Version: 1.0",
      "",
      body,
    ]
      .filter(Boolean)
      .join("\r\n"),
  };
}

async function fetchLatestGmailMessages(limit = 5, query = "") {
  const session = runtimeState.connectorSessions.gmail;
  if (!session?.composioConnectedAccountId) {
    throw new Error("Gmail is not connected through Composio yet.");
  }

  const maxResults = Math.min(Math.max(Number(limit) || 5, 1), 10);
  const params = new URLSearchParams({ maxResults: `${maxResults}` });
  if (query.trim()) {
    params.set("q", query.trim());
  }

  const listPayload = await composioProxy(
    session.composioConnectedAccountId,
    `/gmail/v1/users/me/messages?${params.toString()}`,
  );
  const messages = Array.isArray(listPayload?.data?.messages)
    ? listPayload.data.messages
    : [];

  const detailedMessages = [];
  for (const message of messages) {
    if (!message?.id) continue;
    const detail = await composioProxy(
      session.composioConnectedAccountId,
      `/gmail/v1/users/me/messages/${encodeURIComponent(message.id)}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`,
    );
    const payload = detail?.data || {};
    const headers = payload?.payload?.headers || [];
    detailedMessages.push({
      id: payload.id || message.id,
      threadId: payload.threadId || message.threadId || "",
      from: extractHeader(headers, "From"),
      subject: extractHeader(headers, "Subject") || "(no subject)",
      date: extractHeader(headers, "Date"),
      labels: payload.labelIds || [],
      snippet: payload.snippet || "",
    });
  }

  return {
    ok: true,
    provider: "gmail",
    accountLabel: session.accountLabel || "Gmail via Composio",
    count: detailedMessages.length,
    messages: detailedMessages,
  };
}

async function sendGmailMessage(parameters = {}) {
  const session = runtimeState.connectorSessions.gmail;
  if (!session?.composioConnectedAccountId) {
    throw new Error("Gmail is not connected through Composio yet.");
  }
  const { to, subject, raw } = buildGmailRfc822(parameters);

  const payload = await composioProxy(
    session.composioConnectedAccountId,
    "/gmail/v1/users/me/messages/send",
    "POST",
    { raw: encodeBase64Url(raw) },
  );

  return {
    ok: true,
    tool: "gmail.send",
    data: {
      id: payload?.data?.id || "",
      threadId: payload?.data?.threadId || "",
      labelIds: payload?.data?.labelIds || [],
      to,
      subject,
      accountLabel: session.accountLabel || "Gmail via Composio",
    },
  };
}

async function draftGmailMessage(parameters = {}) {
  const session = runtimeState.connectorSessions.gmail;
  if (!session?.composioConnectedAccountId) {
    throw new Error("Gmail is not connected through Composio yet.");
  }
  const { to, subject, raw } = buildGmailRfc822(parameters);

  const payload = await composioProxy(
    session.composioConnectedAccountId,
    "/gmail/v1/users/me/drafts",
    "POST",
    { message: { raw: encodeBase64Url(raw) } },
  );

  return {
    ok: true,
    tool: "gmail.draft",
    data: {
      id: payload?.data?.id || "",
      messageId: payload?.data?.message?.id || "",
      threadId: payload?.data?.message?.threadId || "",
      to,
      subject,
      accountLabel: session.accountLabel || "Gmail via Composio",
    },
  };
}

function browserUseStatus() {
  return {
    configured: Boolean(browserUseApiKey),
    baseUrl: browserUseBaseUrl,
    model: browserUseModel,
    maxCostUsd: browserUseMaxCostUsd,
  };
}

const googleConnectorScopes = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
];

function getConnectorOAuthConfig(provider) {
  if (provider === "google") {
    return {
      provider,
      clientId: process.env.GOOGLE_CLIENT_ID?.trim() || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: googleConnectorScopes,
    };
  }

  if (provider === "slack") {
    return {
      provider,
      clientId: process.env.SLACK_CLIENT_ID?.trim() || "",
      clientSecret: process.env.SLACK_CLIENT_SECRET?.trim() || "",
      authUrl: "https://slack.com/oauth/v2/authorize",
      tokenUrl: "https://slack.com/api/oauth.v2.access",
      scopes: ["channels:read", "chat:write", "users:read", "files:read"],
    };
  }

  if (provider === "notion") {
    return {
      provider,
      clientId: process.env.NOTION_CLIENT_ID?.trim() || "",
      clientSecret: process.env.NOTION_CLIENT_SECRET?.trim() || "",
      authUrl: "https://api.notion.com/v1/oauth/authorize",
      tokenUrl: "https://api.notion.com/v1/oauth/token",
      scopes: [],
    };
  }

  return null;
}

function connectorRedirectUri(provider) {
  return `http://${host}:${port}/v1/connectors/${encodeURIComponent(provider)}/callback`;
}

function connectorAuthStatus(provider) {
  const config = getConnectorOAuthConfig(provider);
  const session = runtimeState.connectorSessions?.[provider];
  const composioReady = isComposioConnector(provider) && Boolean(getComposioApiKey());
  return {
    ok: true,
    provider,
    configured: provider === "github" ? true : Boolean(composioReady || (config?.clientId && config?.clientSecret)),
    connected: Boolean(session?.accessToken || session?.apiKey || session?.composioConnectedAccountId),
    session: session
      ? {
          authType: session.authType,
          scopes: session.scopes || [],
          accountLabel:
            session.accountLabel ||
            session.teamName ||
            session.workspaceName ||
            session.composioToolkit ||
            "",
          keyPreview: session.keyPreview || "",
          updatedAt: session.updatedAt,
          expiresAt: session.expiresAt || null,
        }
      : null,
  };
}

function connectorSuccessHtml(provider) {
  return `<!doctype html><html><head><title>Connector connected</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#fbf7ef;color:#2f261f;display:grid;place-items:center;min-height:100vh;margin:0}.card{border:1px solid #d7c8b7;background:#fffaf2;border-radius:18px;padding:28px;max-width:460px;box-shadow:0 18px 60px rgba(120,71,35,.16)}h1{margin:0 0 10px;font-size:22px}p{color:#7d6b5a;line-height:1.5}</style></head><body><div class="card"><h1>${provider} connected</h1><p>You can close this tab and return to Control Room. The token is stored locally on this computer.</p></div></body></html>`;
}

async function exchangeConnectorOAuthCode(provider, code) {
  const config = getConnectorOAuthConfig(provider);
  if (!config?.clientId || !config?.clientSecret) {
    throw new Error(`${provider} OAuth is not configured. Add client id and client secret to .env.runtime.local.`);
  }

  const redirectUri = connectorRedirectUri(provider);
  let tokenPayload;

  if (provider === "notion") {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      }),
    });
    tokenPayload = await response.json();
    if (!response.ok) {
      throw new Error(tokenPayload?.error || "Notion OAuth token exchange failed.");
    }
  } else {
    const response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    tokenPayload = await response.json();
    if (!response.ok || tokenPayload?.ok === false) {
      throw new Error(tokenPayload?.error_description || tokenPayload?.error || `${provider} OAuth token exchange failed.`);
    }
  }

  const accessToken = tokenPayload.access_token || tokenPayload.authed_user?.access_token || "";
  if (!accessToken) {
    throw new Error(`${provider} did not return an access token.`);
  }

  const expiresAt = tokenPayload.expires_in
    ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000).toISOString()
    : null;

  runtimeState.connectorSessions[provider] = {
    provider,
    authType: "oauth",
    accessToken,
    refreshToken: tokenPayload.refresh_token || runtimeState.connectorSessions[provider]?.refreshToken || "",
    scopes:
      typeof tokenPayload.scope === "string"
        ? tokenPayload.scope.split(/[,\s]+/).filter(Boolean)
        : config.scopes,
    accountLabel:
      tokenPayload.team?.name ||
      tokenPayload.workspace_name ||
      tokenPayload.owner?.user?.person?.email ||
      tokenPayload.bot_id ||
      provider,
    raw: tokenPayload,
    updatedAt: new Date().toISOString(),
    expiresAt,
  };
  saveConnectorSessions();
  return connectorAuthStatus(provider);
}

function browserUseHeaders() {
  if (!browserUseApiKey) {
    throw new Error("BROWSER_USE_API_KEY is missing in the local runtime environment.");
  }

  return {
    "Content-Type": "application/json",
    "X-Browser-Use-API-Key": browserUseApiKey,
  };
}

function normalizeBrowserUseSession(payload, fallback = {}) {
  const id = payload?.id || payload?.session_id || fallback.id || `browser_${randomUUID()}`;
  const liveUrl =
    payload?.live_url ||
    payload?.liveUrl ||
    payload?.browser_live_view_url ||
    payload?.browserLiveViewUrl ||
    fallback.liveUrl ||
    "";
  const output =
    typeof payload?.output === "string"
      ? payload.output
      : typeof payload?.result === "string"
        ? payload.result
        : typeof payload?.summary === "string"
          ? payload.summary
          : typeof fallback.output === "string"
            ? fallback.output
            : "";
  const error =
    typeof payload?.error === "string"
      ? payload.error
      : typeof payload?.error_message === "string"
        ? payload.error_message
        : typeof fallback.error === "string"
          ? fallback.error
          : "";

  return {
    id,
    status: payload?.status || fallback.status || "created",
    liveUrl,
    output,
    error,
    messages: Array.isArray(payload?.messages) ? payload.messages : fallback.messages || [],
    model: payload?.model || fallback.model || browserUseModel,
    totalCostUsd:
      payload?.total_cost_usd ||
      payload?.totalCostUsd ||
      fallback.totalCostUsd ||
      "",
    task: payload?.task || fallback.task || "",
    createdAt: payload?.created_at || payload?.createdAt || fallback.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    agentId: fallback.agentId || payload?.metadata?.agentId || "",
    agentName: fallback.agentName || payload?.metadata?.agentName || "",
  };
}

function upsertBrowserUseSession(session) {
  const normalized = normalizeBrowserUseSession(session, session);
  const existingIndex = runtimeState.browserUseSessions.findIndex((entry) => entry.id === normalized.id);

  if (existingIndex === -1) {
    runtimeState.browserUseSessions.unshift(normalized);
  } else {
    runtimeState.browserUseSessions[existingIndex] = {
      ...runtimeState.browserUseSessions[existingIndex],
      ...normalized,
    };
  }

  runtimeState.browserUseSessions = runtimeState.browserUseSessions.slice(0, 30);
  return runtimeState.browserUseSessions.find((entry) => entry.id === normalized.id) || normalized;
}

async function createBrowserUseSession(input = {}) {
  const body = {
    task: input.task || "Open a browser session and wait for instructions.",
    model: input.model || browserUseModel,
    keepAlive: Boolean(input.keepAlive),
    maxCostUsd: input.maxCostUsd || browserUseMaxCostUsd,
    skills: true,
    agentmail: false,
    cacheScript: false,
  };

  const response = await fetch(`${browserUseBaseUrl}/sessions`, {
    method: "POST",
    headers: browserUseHeaders(),
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Browser Use error: ${await parseErrorResponse(response)}`);
  }

  const payload = await response.json();
  const session = upsertBrowserUseSession({
    ...payload,
    task: input.task || "",
    agentId: input.agentId || "",
    agentName: input.agentName || "",
  });

  emitRuntimeEvent("browser:session_created", session.id, session.agentId || "unknown-agent", session.agentName || "Unknown Agent", {
    sessionId: session.id,
    liveUrl: session.liveUrl,
    task: session.task,
  });

  return session;
}

async function getBrowserUseSession(sessionId) {
  const response = await fetch(`${browserUseBaseUrl}/sessions/${encodeURIComponent(sessionId)}`, {
    method: "GET",
    headers: browserUseHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Browser Use error: ${await parseErrorResponse(response)}`);
  }

  const payload = await response.json();
  const existing = runtimeState.browserUseSessions.find((entry) => entry.id === sessionId) || {};
  let messages = existing.messages || [];

  try {
    const messagesResponse = await fetch(
      `${browserUseBaseUrl}/sessions/${encodeURIComponent(sessionId)}/messages?limit=100`,
      {
        method: "GET",
        headers: browserUseHeaders(),
      },
    );
    if (messagesResponse.ok) {
      const messagesPayload = await messagesResponse.json();
      messages = Array.isArray(messagesPayload?.messages)
        ? messagesPayload.messages
        : messages;
    }
  } catch {
    // Message history is helpful context, but session status/output is enough.
  }

  const inferredOutput =
    typeof payload?.output === "string" && payload.output.trim()
      ? payload.output
      : messages
          .filter((message) =>
            ["assistant", "agent", "system"].includes(
              String(message?.role || "").toLowerCase(),
            ),
          )
          .map((message) => message?.summary || message?.data || "")
          .filter(Boolean)
          .slice(-3)
          .join("\n\n");

  return upsertBrowserUseSession({
    ...existing,
    ...payload,
    id: sessionId,
    output: inferredOutput,
    messages,
  });
}

async function stopBrowserUseSession(sessionId) {
  const response = await fetch(`${browserUseBaseUrl}/sessions/${encodeURIComponent(sessionId)}/stop`, {
    method: "POST",
    headers: browserUseHeaders(),
  });

  if (!response.ok) {
    throw new Error(`Browser Use error: ${await parseErrorResponse(response)}`);
  }

  const existing = runtimeState.browserUseSessions.find((entry) => entry.id === sessionId) || {};
  const session = upsertBrowserUseSession({
    ...existing,
    id: sessionId,
    status: "stopped",
  });

  emitRuntimeEvent("browser:session_stopped", session.id, session.agentId || "unknown-agent", session.agentName || "Unknown Agent", {
    sessionId: session.id,
  });

  return session;
}

function isBrowserUseTerminalStatus(status = "") {
  return ["completed", "idle", "stopped", "failed", "error", "timed_out", "timeout", "finished", "done"].includes(
    String(status).toLowerCase(),
  );
}

function browserUseSessionOutput(session) {
  if (typeof session?.output === "string" && session.output.trim()) {
    return session.output.trim();
  }

  const messageOutput = (session?.messages || [])
    .filter((message) => ["assistant", "agent", "system"].includes(String(message?.role || "").toLowerCase()))
    .map((message) => message?.summary || message?.data || "")
    .filter(Boolean)
    .slice(-4)
    .join("\n\n")
    .trim();

  if (messageOutput) {
    return messageOutput;
  }

  return session?.error ? `Browser Use error: ${session.error}` : "";
}

function resolveGitHubModelsToken() {
  const explicitToken = process.env.GITHUB_MODELS_TOKEN?.trim();
  if (explicitToken) {
    return { token: explicitToken, source: "env:github_models_token" };
  }

  const githubToken = process.env.GITHUB_TOKEN?.trim();
  if (githubToken) {
    return { token: githubToken, source: "env:github_token" };
  }

  if (runtimeState.githubOauthToken) {
    return { token: runtimeState.githubOauthToken, source: "oauth:device_flow" };
  }

  return { token: "", source: "none" };
}

function githubAuthStatus() {
  const tokenState = resolveGitHubModelsToken();

  return {
    githubDeviceFlow: {
      configured: Boolean(process.env.GITHUB_OAUTH_CLIENT_ID?.trim()),
      authenticated: tokenState.source !== "none",
      tokenSource: tokenState.source,
      scope: runtimeState.githubOauthScope || process.env.GITHUB_OAUTH_SCOPE || "models:read",
    },
  };
}

const copilotModelAliases = new Map([
  ["gpt-4.1", "gpt-4.1"],
  ["gpt-5 mini", "gpt-5-mini"],
  ["gpt-5-mini", "gpt-5-mini"],
  ["gpt-5.1", "gpt-5.1"],
  ["gpt-5.1-codex", "gpt-5.1-codex"],
  ["gpt-5.1-codex-max", "gpt-5.1-codex-max"],
  ["gpt-5.1-codex-mini", "gpt-5.1-codex-mini"],
  ["gpt-5.2", "gpt-5.2"],
  ["gpt-5.2-codex", "gpt-5.2-codex"],
  ["gpt-5.3-codex", "gpt-5.3-codex"],
  ["gpt-5.4", "gpt-5.4"],
  ["gpt-5.4 mini", "gpt-5.4-mini"],
  ["gpt-5.4-mini", "gpt-5.4-mini"],
  ["claude haiku 4.5", "claude-haiku-4.5"],
  ["claude-haiku-4.5", "claude-haiku-4.5"],
  ["claude opus 4.5", "claude-opus-4.5"],
  ["claude-opus-4.5", "claude-opus-4.5"],
  ["claude opus 4.6", "claude-opus-4.6"],
  ["claude-opus-4.6", "claude-opus-4.6"],
  ["claude opus 4.6 (fast mode) (preview)", "claude-opus-4.6-fast-mode-preview"],
  ["claude-opus-4.6-fast-mode-preview", "claude-opus-4.6-fast-mode-preview"],
  ["claude sonnet 4", "claude-sonnet-4"],
  ["claude-sonnet-4", "claude-sonnet-4"],
  ["claude sonnet 4.5", "claude-sonnet-4.5"],
  ["claude-sonnet-4.5", "claude-sonnet-4.5"],
  ["claude sonnet 4.6", "claude-sonnet-4.6"],
  ["claude-sonnet-4.6", "claude-sonnet-4.6"],
  ["gemini 2.5 pro", "gemini-2.5-pro"],
  ["gemini-2.5-pro", "gemini-2.5-pro"],
  ["gemini 3 flash", "gemini-3-flash"],
  ["gemini-3-flash", "gemini-3-flash"],
  ["gemini 3 pro", "gemini-3-pro"],
  ["gemini-3-pro", "gemini-3-pro"],
  ["gemini 3.1 pro", "gemini-3.1-pro"],
  ["gemini-3.1-pro", "gemini-3.1-pro"],
  ["grok code fast 1", "grok-code-fast-1"],
  ["grok-code-fast-1", "grok-code-fast-1"],
  ["raptor mini", "raptor-mini"],
  ["raptor-mini", "raptor-mini"],
  ["goldeneye", "goldeneye"],
]);

const geminiModelAliases = new Map([
  ["gemini 3 flash", "gemini-3-flash-preview"],
  ["gemini-3-flash", "gemini-3-flash-preview"],
  ["gemini 3 flash preview", "gemini-3-flash-preview"],
  ["gemini-3-flash-preview", "gemini-3-flash-preview"],
  ["gemini 3 pro", "gemini-3-pro-preview"],
  ["gemini-3-pro", "gemini-3-pro-preview"],
  ["gemini 3 pro preview", "gemini-3-pro-preview"],
  ["gemini-3-pro-preview", "gemini-3-pro-preview"],
  ["gemini 3.1 pro", "gemini-3.1-pro-preview"],
  ["gemini-3.1-pro", "gemini-3.1-pro-preview"],
  ["gemini 3.1 pro preview", "gemini-3.1-pro-preview"],
  ["gemini-3.1-pro-preview", "gemini-3.1-pro-preview"],
]);

function normalizeCopilotModelId(model = "") {
  const normalized = `${model}`.trim().toLowerCase();
  return copilotModelAliases.get(normalized) || normalized;
}

function normalizeGeminiModelId(model = "") {
  const normalized = `${model}`.trim().toLowerCase().replace(/^models\//, "");
  return geminiModelAliases.get(normalized) || normalized;
}

function getGeminiEmptyResponseFallbackModel(model = "") {
  const normalized = normalizeGeminiModelId(model);

  if (
    normalized.includes("-preview") ||
    normalized.startsWith("gemini-3")
  ) {
    return "gemini-2.5-pro";
  }

  return null;
}

function isGitHubModelsCompatibleFallbackModel(model = "") {
  const normalized = normalizeCopilotModelId(model);

  if (!normalized) {
    return false;
  }

  if (normalized.includes("/")) {
    return true;
  }

  if (normalized.includes("codex") || normalized === "raptor-mini" || normalized === "goldeneye") {
    return false;
  }

  return (
    normalized.startsWith("gpt-") ||
    normalized.startsWith("claude-") ||
    normalized.startsWith("gemini-") ||
    normalized.startsWith("grok-")
  );
}

function getCopilotSafeFallbackModel(model = "") {
  const normalized = normalizeCopilotModelId(model);
  if (!normalized || normalized === "gpt-4.1") {
    return null;
  }

  return "gpt-4.1";
}

function normalizeGitHubModelsModelId(provider = "", model = "") {
  const providerValue = `${provider}`.trim().toLowerCase();
  const normalizedModel = providerValue.includes("copilot")
    ? normalizeCopilotModelId(model)
    : `${model}`.trim().toLowerCase();

  if (normalizedModel.includes("/")) {
    return normalizedModel;
  }

  if (normalizedModel.startsWith("gpt-")) {
    return `openai/${normalizedModel}`;
  }

  if (normalizedModel.startsWith("claude-")) {
    return `anthropic/${normalizedModel}`;
  }

  if (normalizedModel.startsWith("gemini-")) {
    return `google/${normalizedModel}`;
  }

  if (normalizedModel.startsWith("grok-")) {
    return `xai/${normalizedModel}`;
  }

  return normalizedModel;
}

function shouldFallbackFromCopilotProxy(status, message = "") {
  const normalized = `${message}`.toLowerCase();
  return (
    status === 400 ||
    status === 404 ||
    normalized.includes("requested model is not supported") ||
    normalized.includes("unsupported") ||
    normalized.includes("not accessible")
  );
}

const VISION_CAPABLE_PATTERNS = [
  /^gpt-4o/,
  /^gpt-4-turbo/,
  /^gpt-4\.1/,
  /^gpt-4v/,
  /^o[1-4]/,
  /^chatgpt-4o/,
  /^claude-3/,
  /^claude-4/,
  /^gemini-1\.5/,
  /^gemini-2/,
  /^gemini-3/,
  /^gemini-4/,
  /^gemma-3/,
  /^gemma-4/,
  /vision/,
  /vl[-_]?/i,
  /multimodal/i,
  /llama-3\.2-\d+b-vision/,
  /llama-3\.2-11b-vision/,
  /llama-3\.2-90b-vision/,
  /llama-4/,
  /phi-3-vision/,
  /phi-4-multimodal/,
  /kosmos/,
  /fuyu/,
  /neva/,
  /vila/,
  /nemotron-nano-12b-v2-vl/,
  /nemotron-nano-vl/,
  /cosmos-reason/,
  /minimax-m2/,
  /kimi-k2/,
  /glm-5/,
  /glm5/,
  /devstral-2/,
  /step-3\.5/,
  /deepseek-v3\.[12]/,
  /deepseek-v4/,
  /mistral-large-3/,
  /mistral-medium-3/,
  /mistral-small-4/,
  /magistral/,
  /qwen3\.5/,
  /qwen3-coder/,
  /qwen3-next/,
  /moonshot/,
];

function modelSupportsVision(provider, model) {
  const providerValue = `${provider}`.toLowerCase();
  const modelValue = `${model}`.toLowerCase();

  if (providerValue === "openai") return true;
  if (providerValue === "anthropic") return true;
  if (providerValue === "gemini") return true;
  if (providerValue === "copilot") return true;

  for (const pattern of VISION_CAPABLE_PATTERNS) {
    if (pattern.test(modelValue)) return true;
  }

  return false;
}

function conversationHasImages(conversation) {
  return conversation.some(
    (message) => Array.isArray(message.attachments) && message.attachments.length > 0,
  );
}

function stripImagesFromConversation(conversation) {
  return conversation.map((message) => {
    if (!Array.isArray(message.attachments) || message.attachments.length === 0) {
      return message;
    }
    const { attachments, ...rest } = message;
    return rest;
  });
}

function normalizeProvider(provider = "", model = "") {
  const providerValue = `${provider}`.toLowerCase();
  const modelValue = providerValue.includes("copilot")
    ? normalizeCopilotModelId(model)
    : `${model}`.toLowerCase();

  if (providerValue.includes("copilot")) {
    return "copilot";
  }

  if (providerValue.includes("github")) {
    return "githubmodels";
  }

  if (providerValue.includes("groq")) {
    return "groq";
  }

  if (providerValue.includes("nvidia") || providerValue.includes("nim")) {
    return "nvidia";
  }

  if (providerValue.includes("modal")) {
    return "modal";
  }

  if (providerValue.includes("openrouter")) {
    return "openrouter";
  }

  if (providerValue.includes("anthropic")) {
    return "anthropic";
  }

  if (providerValue.includes("openai")) {
    return "openai";
  }

  if (providerValue.includes("google") || providerValue.includes("gemini")) {
    return "gemini";
  }

  if (modelValue.includes("claude")) {
    return "anthropic";
  }

  if (modelValue.startsWith("gemini")) {
    return "gemini";
  }

  if (
    modelValue.startsWith("nvidia/") ||
    modelValue.includes("nemotron") ||
    modelValue.includes("llama-3.") ||
    modelValue.includes("mistral")
  ) {
    return "nvidia";
  }

  if (modelValue.includes("glm") || modelValue.startsWith("zai-org/")) {
    return "modal";
  }

  if (modelValue.includes("gpt")) {
    return "openai";
  }

  if (modelValue.includes("/")) {
    return "openrouter";
  }

  throw new Error(
    `Unsupported provider "${provider}". Right now the local runtime supports OpenAI, Anthropic, OpenRouter, Gemini, Groq, NVIDIA, Modal, and GitHub Models.`,
  );
}

function normalizeConversation(messages = []) {
  const result = [];

  for (const message of messages) {
    if (!message || typeof message.content !== "string" || !message.content.trim()) {
      continue;
    }

    if (message.role === "system") {
      continue;
    }

    const nextRole = message.role === "assistant" ? "assistant" : "user";
    const attachments = Array.isArray(message.attachments)
      ? message.attachments.filter(
          (attachment) =>
            attachment &&
            attachment.type === "image" &&
            typeof attachment.url === "string" &&
            attachment.url.trim(),
        )
      : [];

    if (result.length === 0 && nextRole === "assistant") {
      result.push({
        role: "user",
        content: "The next assistant message is prior context from an earlier local prototype turn. Treat it as background and continue helpfully.",
      });
    }

    const previous = result[result.length - 1];
    if (previous && previous.role === nextRole && (!previous.attachments?.length && attachments.length === 0)) {
      previous.content = `${previous.content}\n\n${message.content}`;
      continue;
    }

    result.push({
      role: nextRole,
      content: message.content.trim(),
      attachments,
    });
  }

  if (result.length === 0) {
    return [{ role: "user", content: "Introduce yourself and ask how you can help." }];
  }

  return result;
}

function buildSystemPrompt(agent) {
  const enabledTools = Object.entries(agent.permissions ?? {})
    .filter(([, enabled]) => typeof enabled === "boolean" && Boolean(enabled))
    .map(([tool]) => tool)
    .join(", ");
  const enabledConnectors = Object.entries(agent.permissions?.connectors ?? {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([connector]) => connector)
    .join(", ");
  const enabledAutomations = Object.entries(agent.permissions?.automations ?? {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([automation]) => automation)
    .join(", ");

  return [
    agent.systemPrompt?.trim() || `You are ${agent.name}, a specialist inside a personal multi-agent workspace.`,
    agent.objective ? `Current objective: ${agent.objective}` : "",
    enabledTools ? `Enabled capabilities: ${enabledTools}.` : "Enabled capabilities: reasoning only.",
    enabledConnectors
      ? `Enabled connectors: ${enabledConnectors}. Use them through the available browser, HTTP, git, file, terminal, and runtime tools. If a connector lacks OAuth/token configuration, say what credential is needed instead of pretending it worked.`
      : "",
    enabledAutomations
      ? `Enabled automation triggers for this agent: ${enabledAutomations}. When an automation run is triggered, complete the requested action and report final status from actual tool/runtime output.`
      : "",
    agent.permissions?.terminal
      ? "Terminal is an available tool, but do not claim that you executed shell commands unless command results are explicitly present in the conversation."
      : "",
    agent.workspace ? `Workspace: ${agent.workspace}` : "",
    agent.sandboxMode ? `Sandbox mode: ${agent.sandboxMode}.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
}

function summarizeConversationForOpenAI(conversation) {
  return conversation
    .map((message) => `${message.role === "assistant" ? "Assistant" : "User"}: ${message.content}`)
    .join("\n\n");
}

function buildOpenAIContentParts(message) {
  const parts = [];

  if (message.content?.trim()) {
    parts.push({
      type: "text",
      text: message.content.trim(),
    });
  }

  for (const attachment of message.attachments ?? []) {
    parts.push({
      type: "image_url",
      image_url: {
        url: attachment.url,
      },
    });
  }

  return parts;
}

function buildResponsesInput(conversation) {
  return conversation.map((message) => ({
    role: message.role,
    content: [
      ...(message.content?.trim()
        ? [
            {
              type: message.role === "assistant" ? "output_text" : "input_text",
              text: message.content.trim(),
            },
          ]
        : []),
      ...((message.attachments ?? []).map((attachment) => ({
        type: "input_image",
        image_url: attachment.url,
      }))),
    ],
  }));
}

function extractOpenAIText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const outputBlocks = Array.isArray(payload?.output) ? payload.output : [];
  const textParts = [];

  for (const block of outputBlocks) {
    if (!Array.isArray(block?.content)) {
      continue;
    }

    for (const item of block.content) {
      if (typeof item?.text === "string" && item.text.trim()) {
        textParts.push(item.text.trim());
      }
    }
  }

  return textParts.join("\n\n").trim();
}

function extractAnthropicText(payload) {
  const blocks = Array.isArray(payload?.content) ? payload.content : [];
  return blocks
    .filter((block) => block?.type === "text" && typeof block.text === "string")
    .map((block) => block.text.trim())
    .filter(Boolean)
    .join("\n\n");
}

function extractOpenRouterText(payload) {
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  const content = choice?.message?.content;

  if (typeof content === "string") {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => (typeof item?.text === "string" ? item.text.trim() : ""))
      .filter(Boolean)
      .join("\n\n");
  }

  return "";
}

function extractGeminiText(payload) {
  const candidates = Array.isArray(payload?.candidates) ? payload.candidates : [];
  const parts = candidates[0]?.content?.parts;

  if (!Array.isArray(parts)) {
    return "";
  }

  return parts
    .map((part) => (typeof part?.text === "string" ? part.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}

function describeGeminiEmptyResponse(payload) {
  const candidate = Array.isArray(payload?.candidates) ? payload.candidates[0] : null;
  const finishReason = candidate?.finishReason;
  const safetyRatings = Array.isArray(candidate?.safetyRatings)
    ? candidate.safetyRatings
        .map((rating) => `${rating.category || "unknown"}:${rating.probability || "unknown"}`)
        .join(", ")
    : "";
  const blockReason = payload?.promptFeedback?.blockReason;

  return [
    blockReason ? `blockReason=${blockReason}` : "",
    finishReason ? `finishReason=${finishReason}` : "",
    safetyRatings ? `safety=${safetyRatings}` : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function buildOpenAICompatibleMessages(agent, conversation) {
  return [
    { role: "system", content: buildSystemPrompt(agent) },
    ...conversation.map((message) => {
      const parts = buildOpenAIContentParts(message);
      return {
        role: message.role,
        content: parts.length > 0 ? parts : message.content,
      };
    }),
  ];
}

function buildGeminiContents(conversation) {
  return conversation.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [
      ...(message.content?.trim()
        ? [
            {
              text: message.content,
            },
          ]
        : []),
      ...((message.attachments ?? []).map((attachment) => {
        const match = attachment.url.match(/^data:([^;]+);base64,(.+)$/);
        if (!match) {
          return null;
        }

        return {
          inlineData: {
            mimeType: match[1],
            data: match[2],
          },
        };
      }).filter(Boolean)),
    ],
  }));
}

async function parseErrorResponse(response) {
  const rawText = await response.text();

  try {
    const json = JSON.parse(rawText);
    return (
      json?.error?.message ||
      json?.error ||
      json?.message ||
      rawText ||
      response.statusText
    );
  } catch {
    return rawText || response.statusText;
  }
}

async function callOpenAI(agent, conversation) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is missing in the local runtime environment.");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: agent.model,
      instructions: buildSystemPrompt(agent),
      input: buildResponsesInput(conversation),
      max_output_tokens: 1200,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI error: ${await parseErrorResponse(response)}`);
  }

  const payload = await response.json();
  const text = extractOpenAIText(payload);

  if (!text) {
    throw new Error("OpenAI returned an empty response.");
  }

  return {
    text,
    usage: payload.usage ?? null,
    provider: "openai",
  };
}

async function callAnthropic(agent, conversation) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY is missing in the local runtime environment.");
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: agent.model,
      system: buildSystemPrompt(agent),
      max_tokens: 1200,
      messages: conversation,
    }),
  });

  if (!response.ok) {
    throw new Error(`Anthropic error: ${await parseErrorResponse(response)}`);
  }

  const payload = await response.json();
  const text = extractAnthropicText(payload);

  if (!text) {
    throw new Error("Anthropic returned an empty response.");
  }

  return {
    text,
    usage: payload.usage ?? null,
    provider: "anthropic",
  };
}

async function callOpenRouter(agent, conversation) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is missing in the local runtime environment.");
  }

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost",
      "X-Title": "Control Room",
    },
    body: JSON.stringify({
      model: agent.model,
      max_tokens: 1200,
      messages: buildOpenAICompatibleMessages(agent, conversation),
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${await parseErrorResponse(response)}`);
  }

  const payload = await response.json();
  const text = extractOpenRouterText(payload);

  if (!text) {
    throw new Error("OpenRouter returned an empty response.");
  }

  return {
    text,
    usage: payload.usage ?? null,
    provider: "openrouter",
  };
}

async function callGemini(agent, conversation) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is missing in the local runtime environment.");
  }
  const modelId = normalizeGeminiModelId(agent.model);
  const requestGeminiModel = async (nextModelId) => {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(nextModelId)}:generateContent`,
      {
        method: "POST",
        headers: {
          "x-goog-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          system_instruction: {
            parts: [
              {
                text: buildSystemPrompt(agent),
              },
            ],
          },
          contents: buildGeminiContents(conversation),
          generationConfig: {
            maxOutputTokens: 4096,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Gemini error: ${await parseErrorResponse(response)}`);
    }

    const payload = await response.json();
    return {
      payload,
      text: extractGeminiText(payload),
    };
  };

  let { payload, text } = await requestGeminiModel(modelId);

  if (!text) {
    const blockReason = payload?.promptFeedback?.blockReason;
    const emptyDetails = describeGeminiEmptyResponse(payload);
    const fallbackModel = blockReason
      ? null
      : getGeminiEmptyResponseFallbackModel(modelId);

    if (fallbackModel && fallbackModel !== modelId) {
      const fallback = await requestGeminiModel(fallbackModel);
      payload = fallback.payload;
      text = fallback.text;
    }

    if (text) {
      return {
        text,
        usage: payload.usageMetadata ?? null,
        provider: "gemini",
      };
    }

    throw new Error(
      blockReason
        ? `Gemini blocked the prompt: ${blockReason}`
        : `Gemini returned an empty response${emptyDetails ? ` (${emptyDetails})` : ""}.`,
    );
  }

  return {
    text,
    usage: payload.usageMetadata ?? null,
    provider: "gemini",
  };
}

async function callGroq(agent, conversation) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is missing in the local runtime environment.");
  }

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: agent.model,
      max_tokens: 1200,
      messages: buildOpenAICompatibleMessages(agent, conversation),
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq error: ${await parseErrorResponse(response)}`);
  }

  const payload = await response.json();
  const text = extractOpenRouterText(payload);

  if (!text) {
    throw new Error("Groq returned an empty response.");
  }

  return {
    text,
    usage: payload.usage ?? null,
    provider: "groq",
  };
}

async function callNvidia(agent, conversation) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) {
    throw new Error("NVIDIA_API_KEY is missing in the local runtime environment.");
  }

  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: agent.model || process.env.NVIDIA_CHAT_MODEL || "nvidia/llama-3.3-nemotron-super-49b-v1.5",
      max_tokens: 1200,
      messages: buildOpenAICompatibleMessages(agent, conversation),
    }),
  });

  if (!response.ok) {
    throw new Error(`NVIDIA error: ${await parseErrorResponse(response)}`);
  }

  const payload = await response.json();
  const text = extractOpenRouterText(payload);

  if (!text) {
    throw new Error("NVIDIA returned an empty response.");
  }

  return {
    text,
    usage: payload.usage ?? null,
    provider: "nvidia",
  };
}

async function callModal(agent, conversation) {
  const apiKey = process.env.MODAL_API_KEY;
  if (!apiKey) {
    throw new Error("MODAL_API_KEY is missing in the local runtime environment.");
  }

  const baseUrl = process.env.MODAL_API_BASE_URL || "https://api.us-west-2.modal.direct";

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: agent.model || "zai-org/GLM-5.1-FP8",
      max_tokens: 1200,
      messages: buildOpenAICompatibleMessages(agent, conversation),
    }),
  });

  if (!response.ok) {
    throw new Error(`Modal error: ${await parseErrorResponse(response)}`);
  }

  const payload = await response.json();
  const text = extractOpenRouterText(payload);

  if (!text) {
    throw new Error("Modal returned an empty response.");
  }

  return {
    text,
    usage: payload.usage ?? null,
    provider: "modal",
  };
}

async function callGitHubModels(agent, conversation) {
  const { token, source } = resolveGitHubModelsToken();
  if (!token) {
    throw new Error(
      "GitHub Models token is missing. Set GITHUB_MODELS_TOKEN/GITHUB_TOKEN or connect via the Copilot device OAuth flow.",
    );
  }

  const response = await fetch("https://models.github.ai/inference/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: normalizeGitHubModelsModelId(agent.provider, agent.model),
      max_tokens: 1200,
      messages: buildOpenAICompatibleMessages(agent, conversation),
    }),
  });

  if (!response.ok) {
    const modelId = normalizeGitHubModelsModelId(agent.provider, agent.model);
    const errorText = await parseErrorResponse(response);

    if (response.status === 400 && /unknown model/i.test(errorText)) {
      try {
        const catalogResponse = await fetch("https://models.github.ai/catalog/models", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2026-03-10",
          },
        });

        if (catalogResponse.ok) {
          const catalog = await catalogResponse.json();
          const availableIds = Array.isArray(catalog)
            ? catalog.map((entry) => `${entry?.id ?? ""}`.toLowerCase()).filter(Boolean)
            : [];
          const hasAnyGeminiModels = availableIds.some((id) => id.includes("gemini") || id.startsWith("google/"));

          if (modelId.startsWith("google/") && !availableIds.includes(modelId.toLowerCase())) {
            throw new Error(
              hasAnyGeminiModels
                ? `GitHub Models does not expose ${modelId} for this account/token yet.`
                : "GitHub Models does not expose any Google Gemini models for this account/token yet.",
            );
          }
        }
      } catch (catalogError) {
        if (catalogError instanceof Error) {
          throw catalogError;
        }
      }
    }

    throw new Error(`GitHub Models error: ${errorText}`);
  }

  const payload = await response.json();
  const text = extractOpenRouterText(payload);

  if (!text) {
    throw new Error("GitHub Models returned an empty response.");
  }

  return {
    text,
    usage: payload.usage ?? null,
    provider: "githubmodels",
    tokenSource: source,
  };
}

async function ensureCopilotApiToken() {
  const now = Date.now();
  // Reuse cached token if it has > 60s remaining
  if (runtimeState.copilotApiToken && runtimeState.copilotApiTokenExpiresAt > now + 60_000) {
    return runtimeState.copilotApiToken;
  }

  // The Copilot internal token exchange ONLY works with OAuth device-flow tokens (ghu_).
  // Classic PATs (ghp_) will get 404. Prioritize the OAuth token from device flow.
  const oauthToken = runtimeState.githubOauthToken;
  if (!oauthToken) {
    throw new Error(
      "Copilot models require OAuth authentication. Click 'Connect Copilot' in the top bar first to authenticate via the GitHub device flow.",
    );
  }

  log("Exchanging OAuth token for Copilot API token...");

  const response = await fetch("https://api.github.com/copilot_internal/v2/token", {
    method: "GET",
    headers: {
      Authorization: `token ${oauthToken}`,
      Accept: "application/json",
      "User-Agent": "GithubCopilot/1.300.0",
      "Editor-Version": "vscode/1.100.0",
      "Editor-Plugin-Version": "copilot/1.300.0",
    },
  });

  if (!response.ok) {
    const errText = await parseErrorResponse(response);
    throw new Error(
      `Copilot token exchange failed (${response.status}): ${errText}. ` +
      `Make sure you clicked 'Connect Copilot' and your GitHub Student Developer Pack includes Copilot access.`,
    );
  }

  const payload = await response.json();
  const copilotToken = payload?.token;
  const expiresAt = payload?.expires_at ? new Date(payload.expires_at * 1000).getTime() : now + 25 * 60_000;

  if (!copilotToken) {
    throw new Error("Copilot token exchange returned no token. Check your Copilot subscription.");
  }

  runtimeState.copilotApiToken = copilotToken;
  runtimeState.copilotApiTokenExpiresAt = expiresAt;

  log("Copilot API token obtained successfully.");
  return copilotToken;
}

async function callCopilotProxy(agent, conversation, options = {}) {
  const copilotToken = await ensureCopilotApiToken();
  const copilotModel = normalizeCopilotModelId(options.modelOverride || agent.model);
  const allowCopilotModelFallback = options.allowCopilotModelFallback !== false;
  const allowGitHubModelsFallback = options.allowGitHubModelsFallback !== false;

  const copilotHeaders = {
    Authorization: `Bearer ${copilotToken}`,
    "Content-Type": "application/json",
    "Editor-Version": "vscode/1.100.0",
    "Editor-Plugin-Version": "copilot/1.300.0",
    "Openai-Organization": "github-copilot",
    "Copilot-Integration-Id": "vscode-chat",
    "User-Agent": "GithubCopilot/1.300.0",
  };

  const messages = buildOpenAICompatibleMessages(agent, conversation);

  async function tryAlternativeFallback(baseError, phaseLabel) {
    const safeFallbackModel = allowCopilotModelFallback ? getCopilotSafeFallbackModel(copilotModel) : null;

    if (safeFallbackModel && safeFallbackModel !== copilotModel) {
      try {
        log(`Copilot model "${copilotModel}" failed on ${phaseLabel}; retrying with safe fallback "${safeFallbackModel}".`);
        return await callCopilotProxy(agent, conversation, {
          modelOverride: safeFallbackModel,
          allowCopilotModelFallback: false,
          allowGitHubModelsFallback,
        });
      } catch (fallbackModelError) {
        baseError = `${baseError} Safe Copilot fallback "${safeFallbackModel}" also failed: ${fallbackModelError.message}`;
      }
    }

    if (allowGitHubModelsFallback && isGitHubModelsCompatibleFallbackModel(copilotModel)) {
      try {
        const githubModelsResult = await callGitHubModels(agent, conversation);
        return {
          ...githubModelsResult,
          provider: "githubmodels",
          tokenSource: "github_models_fallback",
        };
      } catch (fallbackError) {
        throw new Error(`${baseError} GitHub Models fallback also failed: ${fallbackError.message}`);
      }
    }

    throw new Error(baseError);
  }

  // First try /chat/completions
  const chatResponse = await fetch("https://api.githubcopilot.com/chat/completions", {
    method: "POST",
    headers: copilotHeaders,
    body: JSON.stringify({
      model: copilotModel,
      max_tokens: 1200,
      messages,
      stream: false,
    }),
  });

  if (chatResponse.ok) {
    const payload = await chatResponse.json();
    const text = extractOpenRouterText(payload);
    if (text) {
      return { text, usage: payload.usage ?? null, provider: "copilot", tokenSource: "copilot_proxy" };
    }
  }

  // Check if model needs /responses endpoint instead
  const chatError = await parseErrorResponse(chatResponse).catch(() => "");
  const needsResponsesApi = chatError.includes("not accessible") || chatError.includes("unsupported");

  if (!needsResponsesApi) {
    if (chatResponse.status === 401) {
      runtimeState.copilotApiToken = "";
      runtimeState.copilotApiTokenExpiresAt = 0;
    }
    if (shouldFallbackFromCopilotProxy(chatResponse.status, chatError)) {
      return tryAlternativeFallback(
        `Copilot proxy rejected model "${copilotModel}". `,
        "/chat/completions",
      );
    }
    throw new Error(`Copilot proxy error: ${chatError}`);
  }

  // Fallback: use the /responses endpoint (newer OpenAI Responses API format)
  log(`Model "${copilotModel}" not on /chat/completions, trying /responses endpoint...`);

  // Keep the full non-system conversation so follow-up turns like
  // "run it yourself" still have the original task context.
  const nonSystemConversation = conversation.filter((message) => message.role !== "system");
  const systemInstructions = messages.filter(m => m.role === "system").map(m => m.content).join("\n");

  const responsesBody = {
    model: copilotModel,
    input: nonSystemConversation.length > 0 ? buildResponsesInput(nonSystemConversation) : "Help the user.",
    max_output_tokens: 1200,
    stream: false,
  };
  if (systemInstructions) {
    responsesBody.instructions = systemInstructions;
  }

  const responsesResponse = await fetch("https://api.githubcopilot.com/responses", {
    method: "POST",
    headers: copilotHeaders,
    body: JSON.stringify(responsesBody),
  });

  if (!responsesResponse.ok) {
    if (responsesResponse.status === 401) {
      runtimeState.copilotApiToken = "";
      runtimeState.copilotApiTokenExpiresAt = 0;
    }
    const responsesError = await parseErrorResponse(responsesResponse);
    if (shouldFallbackFromCopilotProxy(responsesResponse.status, responsesError)) {
      return tryAlternativeFallback(
        `Copilot /responses rejected model "${copilotModel}". `,
        "/responses",
      );
    }
    throw new Error(`Copilot /responses error: ${responsesError}`);
  }

  const responsesPayload = await responsesResponse.json();

  // Extract text from the Responses API format
  let text = "";
  if (responsesPayload?.output) {
    for (const item of responsesPayload.output) {
      if (item.type === "message" && item.content) {
        for (const part of item.content) {
          if (part.type === "output_text" || part.type === "text") {
            text += part.text || "";
          }
        }
      }
    }
  }
  // Fallback: try direct text field
  if (!text && responsesPayload?.text) {
    text = responsesPayload.text;
  }

  if (!text) {
    throw new Error("Copilot /responses returned an empty response.");
  }

  return {
    text,
    usage: responsesPayload.usage ?? null,
    provider: "copilot",
    tokenSource: "copilot_responses",
  };
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is missing in the local runtime environment.`);
  }
  return value;
}

function githubOAuthConfig() {
  return {
    clientId: requiredEnv("GITHUB_OAUTH_CLIENT_ID"),
    clientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET?.trim() || "",
    scope: process.env.GITHUB_OAUTH_SCOPE?.trim() || "copilot",
  };
}

async function startGitHubDeviceFlow() {
  const config = githubOAuthConfig();
  const body = new URLSearchParams({
    client_id: config.clientId,
    scope: config.scope,
  });

  const response = await fetch("https://github.com/login/device/code", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`GitHub OAuth start error: ${await parseErrorResponse(response)}`);
  }

  const payload = await response.json();

  if (payload?.error) {
    throw new Error(payload.error_description || payload.error);
  }

  const interval = Number(payload?.interval || oauthPollBaseIntervalSeconds);

  return {
    ok: true,
    deviceCode: payload?.device_code || "",
    userCode: payload?.user_code || "",
    verificationUri: payload?.verification_uri || "https://github.com/login/device",
    verificationUriComplete: payload?.verification_uri_complete || "",
    expiresIn: Number(payload?.expires_in || 900),
    interval: Number.isFinite(interval) && interval > 0 ? interval : oauthPollBaseIntervalSeconds,
    scope: config.scope,
  };
}

async function pollGitHubDeviceFlow(deviceCode) {
  const normalizedCode = `${deviceCode || ""}`.trim();
  if (!normalizedCode) {
    throw new Error("deviceCode is required.");
  }

  const config = githubOAuthConfig();
  const params = {
    client_id: config.clientId,
    device_code: normalizedCode,
    grant_type: "urn:ietf:params:oauth:grant-type:device_code",
  };
  if (config.clientSecret) {
    params.client_secret = config.clientSecret;
  }
  const body = new URLSearchParams(params);

  const response = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`GitHub OAuth poll error: ${await parseErrorResponse(response)}`);
  }

  const payload = await response.json();

  if (payload?.error === "authorization_pending") {
    return {
      ok: false,
      pending: true,
      interval: oauthPollBaseIntervalSeconds,
      error: "Authorization pending. Complete the GitHub verification step first.",
    };
  }

  if (payload?.error === "slow_down") {
    return {
      ok: false,
      pending: true,
      slowDown: true,
      interval: oauthPollBaseIntervalSeconds + 5,
      error: "GitHub asked to slow down polling.",
    };
  }

  if (payload?.error) {
    return {
      ok: false,
      pending: false,
      error: payload?.error_description || payload.error,
    };
  }

  const accessToken = `${payload?.access_token || ""}`.trim();
  if (!accessToken) {
    return {
      ok: false,
      pending: false,
      error: "GitHub OAuth did not return an access token.",
    };
  }

  runtimeState.githubOauthToken = accessToken;
  runtimeState.githubOauthScope = `${payload?.scope || config.scope}`.trim();
  runtimeState.githubOauthTokenType = `${payload?.token_type || "bearer"}`.trim();
  runtimeState.githubOauthUpdatedAt = new Date().toISOString();
  saveCopilotSession();

  return {
    ok: true,
    authenticated: true,
    tokenSource: "oauth:device_flow",
    scope: runtimeState.githubOauthScope,
    updatedAt: runtimeState.githubOauthUpdatedAt,
  };
}

function clearGitHubOAuthToken() {
  runtimeState.githubOauthToken = "";
  runtimeState.githubOauthScope = "";
  runtimeState.githubOauthTokenType = "";
  runtimeState.githubOauthUpdatedAt = "";
  saveCopilotSession();

  return {
    ok: true,
    authenticated: false,
  };
}

function buildPhase4ProfileInjection(profile) {
  const parts = ["<!-- digital-twin-profile -->", "## User Profile (Digital Twin)"];
  if (profile.techStack?.length) parts.push(`**Tech Stack:** ${profile.techStack.join(", ")}`);
  if (profile.codingStyle) parts.push(`**Coding Style:** ${profile.codingStyle}`);
  if (profile.preferredLanguage) parts.push(`**Preferred Language:** ${profile.preferredLanguage}`);
  if (profile.workflowNotes) parts.push(`**Workflow:** ${profile.workflowNotes}`);
  if (profile.timezone) parts.push(`**Timezone:** ${profile.timezone}`);
  parts.push("\nUse this context to personalize your responses.");
  return parts.join("\n");
}

async function runChat(body) {
  const agent = body?.agent;
  if (!agent?.name || !agent?.provider || !agent?.model) {
    throw new Error("Agent name, provider, and model are required.");
  }

  const provider = normalizeProvider(agent.provider, agent.model);
  let conversation = normalizeConversation(body.messages);

  if (conversationHasImages(conversation) && !modelSupportsVision(agent.provider, agent.model)) {
    conversation = stripImagesFromConversation(conversation);
    const lastUser = [...conversation].reverse().find((m) => m.role === "user");
    if (lastUser) {
      lastUser.content = `${lastUser.content}\n\n[Note: You attached an image, but the current model (${agent.model}) does not support image input. The image has been removed from this request. Switch to a vision-capable model like GPT-4o, Claude 3, or Gemini to use image attachments.]`;
    }
  }

  // Phase 4 — Module 18: inject Digital Twin profile if it has meaningful data
  const hasProfileData =
    (phase4UserProfile.techStack?.length ?? 0) > 0 ||
    phase4UserProfile.workflowNotes?.trim().length > 0;

  if (hasProfileData) {
    const profileBlock = buildPhase4ProfileInjection(phase4UserProfile);
    // Remove previous injection, then prepend fresh one
    const stripped = conversation.filter(
      (m) => !(m.role === "system" && m.content?.startsWith("<!-- digital-twin-profile -->"))
    );
    conversation = [{ role: "system", content: profileBlock }, ...stripped];
  }

  if (provider === "openai") {
    return callOpenAI(agent, conversation);
  }

  if (provider === "anthropic") {
    return callAnthropic(agent, conversation);
  }

  if (provider === "openrouter") {
    return callOpenRouter(agent, conversation);
  }

  if (provider === "gemini") {
    return callGemini(agent, conversation);
  }

  if (provider === "groq") {
    return callGroq(agent, conversation);
  }

  if (provider === "nvidia") {
    return callNvidia(agent, conversation);
  }

  if (provider === "modal") {
    return callModal(agent, conversation);
  }

  if (provider === "githubmodels") {
    return callGitHubModels(agent, conversation);
  }

  if (provider === "copilot") {
    return callCopilotProxy(agent, conversation);
  }

  throw new Error(`Unsupported provider "${provider}".`);
}

function isPathInsideWorkspace(workspace, candidate) {
  const normalizedWorkspace = resolve(workspace);
  const normalizedCandidate = resolve(candidate);
  return (
    normalizedCandidate === normalizedWorkspace ||
    normalizedCandidate.startsWith(`${normalizedWorkspace}/`)
  );
}

function validateCommand(agent, command, cwd) {
  if (!agent?.permissions?.terminal) {
    throw new Error("This agent is not allowed to use terminal access.");
  }

  if (!agent.workspace) {
    throw new Error("This agent does not have a workspace configured.");
  }

  if (agent.sandboxMode === "none") {
    throw new Error("Sandbox mode is disabled for this agent.");
  }

  const workspace = resolve(agent.workspace);
  const nextCwd = resolve(cwd || workspace);

  if (!isPathInsideWorkspace(workspace, nextCwd)) {
    throw new Error("The requested cwd is outside the agent workspace.");
  }

  for (const pattern of blockedCommandPatterns) {
    if (pattern.test(command)) {
      throw new Error("Blocked a dangerous terminal command.");
    }
  }

  if (agent.sandboxMode === "read-only") {
    if (/[|;&><`$]/.test(command)) {
      throw new Error("Read-only mode blocks shell operators and redirection.");
    }

    const baseCommand = command.trim().split(/\s+/)[0];
    if (!readOnlyCommands.has(baseCommand)) {
      throw new Error(`Read-only mode does not allow "${baseCommand}".`);
    }
  }

  return { workspace, cwd: nextCwd };
}

function trimOutput(value, limit = 20_000) {
  if (!value) {
    return "";
  }

  return value.length > limit ? `${value.slice(0, limit)}\n...[truncated]` : value;
}

function classifyCommandActivity(command = "") {
  const normalized = command.trim().toLowerCase();

  if (
    normalized.startsWith("rg ") ||
    normalized === "rg" ||
    normalized.startsWith("grep ") ||
    normalized === "grep" ||
    normalized.startsWith("fd ") ||
    normalized === "fd" ||
    normalized.includes("git grep")
  ) {
    return {
      kind: "search",
      label: "Searching Code",
      summary: "Scanning the workspace for matching code or files.",
    };
  }

  if (
    normalized.startsWith("cat ") ||
    normalized.startsWith("sed ") ||
    normalized.startsWith("head ") ||
    normalized.startsWith("tail ") ||
    normalized.startsWith("less ") ||
    normalized.startsWith("more ") ||
    normalized === "ls" ||
    normalized.startsWith("ls ") ||
    normalized === "tree" ||
    normalized.startsWith("tree ") ||
    normalized === "pwd" ||
    normalized.startsWith("stat ") ||
    normalized.startsWith("wc ")
  ) {
    return {
      kind: "read",
      label: "Reading Files",
      summary: "Inspecting files or listing the workspace.",
    };
  }

  if (
    normalized === "git" ||
    normalized.startsWith("git ") ||
    normalized.includes("git status") ||
    normalized.includes("git diff") ||
    normalized.includes("git log")
  ) {
    return {
      kind: "git",
      label: "Checking Git",
      summary: "Inspecting git state and repository history.",
    };
  }

  if (
    normalized.includes("npm test") ||
    normalized.includes("pnpm test") ||
    normalized.includes("yarn test") ||
    normalized.includes("bun test") ||
    normalized.includes("vitest") ||
    normalized.includes("jest") ||
    normalized.includes("pytest") ||
    normalized.includes("playwright test") ||
    normalized.includes("cargo test") ||
    normalized.includes("go test")
  ) {
    return {
      kind: "test",
      label: "Running Tests",
      summary: "Executing test commands in the workspace.",
    };
  }

  if (
    normalized.includes("npm run build") ||
    normalized.includes("pnpm build") ||
    normalized.includes("yarn build") ||
    normalized.includes("vite build") ||
    normalized.includes("next build") ||
    normalized.includes("tsc") ||
    normalized.includes("cargo build") ||
    normalized.includes("gradle") ||
    normalized.includes("make")
  ) {
    return {
      kind: "build",
      label: "Building Project",
      summary: "Compiling or building the project.",
    };
  }

  if (
    normalized.includes("npm install") ||
    normalized.includes("pnpm install") ||
    normalized.includes("yarn install") ||
    normalized.includes("bun install")
  ) {
    return {
      kind: "install",
      label: "Installing Dependencies",
      summary: "Installing or refreshing project dependencies.",
    };
  }

  return {
    kind: "sandbox",
    label: "Using Sandbox",
    summary: "Running a workspace command inside the sandbox.",
  };
}

function createCommandRun(agent, command, cwd, options = {}) {
  const activity = classifyCommandActivity(command);
  const initialStatus = options.status || "queued";
  const initialPhase = options.phase || "queued";

  const run = {
    id: `run_${randomUUID()}`,
    agentId: agent?.id || "unknown-agent",
    agentName: agent?.name || "Unknown Agent",
    command,
    cwd,
    status: initialStatus,
    phase: initialPhase,
    activity,
    startedAt: initialStatus === "running" ? new Date().toISOString() : null,
    queuedAt: initialStatus === "queued" ? new Date().toISOString() : null,
    plannedAt: null,
    completedAt: null,
    canceledAt: null,
    durationMs: null,
    exitCode: null,
    timedOut: false,
    stdout: "",
    stderr: "",
    error: "",
    retryCount: options.retryCount || 0,
    maxRetries: options.maxRetries || 3,
    parentRunId: options.parentRunId || null,
    retryOfRunId: options.retryOfRunId || null,
    model: agent?.model || null,
    provider: agent?.provider || null,
    tokenUsage: null,
    toolCalls: [],
    artifacts: [],
  };

  emitRuntimeEvent("run:queued", run.id, run.agentId, run.agentName, {
    command,
    cwd,
    activity,
    status: initialStatus,
  });

  return run;
}

function upsertCommandRun(run) {
  const existingIndex = runtimeState.commandRuns.findIndex((entry) => entry.id === run.id);

  if (existingIndex === -1) {
    runtimeState.commandRuns = [run, ...runtimeState.commandRuns].slice(0, maxRetainedCommandRuns);
    return run;
  }

  runtimeState.commandRuns = runtimeState.commandRuns.map((entry, index) =>
    index === existingIndex ? { ...entry, ...run } : entry,
  );
  return runtimeState.commandRuns[existingIndex];
}

function updateCommandRun(runId, updater) {
  const existingRun = runtimeState.commandRuns.find((entry) => entry.id === runId);
  if (!existingRun) {
    return null;
  }

  const nextRun = updater(existingRun);
  upsertCommandRun(nextRun);
  return nextRun;
}

function serializeCommandRun(run) {
  return {
    id: run.id,
    agentId: run.agentId,
    agentName: run.agentName,
    command: run.command,
    cwd: run.cwd,
    status: run.status,
    phase: run.phase,
    activity: run.activity,
    startedAt: run.startedAt,
    queuedAt: run.queuedAt || null,
    plannedAt: run.plannedAt || null,
    completedAt: run.completedAt,
    canceledAt: run.canceledAt || null,
    durationMs: run.durationMs,
    exitCode: run.exitCode,
    timedOut: run.timedOut,
    stdout: trimOutput(run.stdout),
    stderr: trimOutput(run.stderr),
    error: run.error || "",
    retryCount: run.retryCount || 0,
    maxRetries: run.maxRetries || 3,
    parentRunId: run.parentRunId || null,
    retryOfRunId: run.retryOfRunId || null,
    model: run.model || null,
    provider: run.provider || null,
    tokenUsage: run.tokenUsage || null,
    toolCalls: run.toolCalls || [],
    artifacts: run.artifacts || [],
  };
}

function transitionRunStatus(runId, newStatus, newPhase, extra) {
  const run = runtimeState.commandRuns.find((entry) => entry.id === runId);
  if (!run) return null;

  const validTransitions = {
    queued: ["planning", "running", "blocked", "canceled"],
    planning: ["running", "waiting_for_approval", "blocked", "failed", "canceled"],
    running: ["waiting_for_approval", "completed", "failed", "canceled"],
    waiting_for_approval: ["running", "blocked", "canceled"],
    blocked: ["queued", "canceled"],
    completed: ["queued"],
    failed: ["queued"],
    canceled: ["queued"],
  };

  const allowed = validTransitions[run.status] || [];
  if (!allowed.includes(newStatus) && run.status !== newStatus) {
    log(`Invalid transition: ${run.status} -> ${newStatus} for run ${runId}`);
    return null;
  }

  const now = new Date().toISOString();
  const updates = {
    status: newStatus,
    phase: newPhase || newStatus,
    ...extra,
  };

  if (newStatus === "running" && !run.startedAt) {
    updates.startedAt = now;
  }
  if (newStatus === "planning" && !run.plannedAt) {
    updates.plannedAt = now;
  }
  if (newStatus === "completed" || newStatus === "failed" || newStatus === "canceled") {
    updates.completedAt = now;
    if (run.startedAt) {
      updates.durationMs = Date.now() - new Date(run.startedAt).getTime();
    }
  }
  if (newStatus === "canceled") {
    updates.canceledAt = now;
  }

  const nextRun = { ...run, ...updates };
  upsertCommandRun(nextRun);

  const eventType = `run:${newStatus === "running" ? "started" : newStatus}`;
  emitRuntimeEvent(eventType, runId, run.agentId, run.agentName, {
    previousStatus: run.status,
    newStatus,
    phase: updates.phase,
    ...extra,
  });

  return nextRun;
}

function retryCommandRun(runId) {
  const originalRun = runtimeState.commandRuns.find((entry) => entry.id === runId);
  if (!originalRun) {
    return { ok: false, statusCode: 404, error: "Run not found" };
  }

  if (!["failed", "blocked", "canceled"].includes(originalRun.status)) {
    return { ok: false, statusCode: 409, error: `Cannot retry a run in "${originalRun.status}" state. Only failed, blocked, or canceled runs can be retried.` };
  }

  const agent = { id: originalRun.agentId, name: originalRun.agentName };
  const retriedRun = createCommandRun(agent, originalRun.command, originalRun.cwd, {
    status: "queued",
    phase: "queued",
    retryCount: (originalRun.retryCount || 0) + 1,
    maxRetries: originalRun.maxRetries || 3,
    retryOfRunId: originalRun.id,
  });

  upsertCommandRun(retriedRun);

  emitRuntimeEvent("run:retried", retriedRun.id, retriedRun.agentId, retriedRun.agentName, {
    originalRunId: originalRun.id,
    retryCount: retriedRun.retryCount,
  });

  return {
    ok: true,
    statusCode: 200,
    run: serializeCommandRun(retriedRun),
  };
}

function resumeCommandRun(runId) {
  const run = runtimeState.commandRuns.find((entry) => entry.id === runId);
  if (!run) {
    return { ok: false, statusCode: 404, error: "Run not found" };
  }

  if (run.status !== "blocked" && run.status !== "waiting_for_approval") {
    return { ok: false, statusCode: 409, error: `Cannot resume a run in "${run.status}" state. Only blocked or waiting_for_approval runs can be resumed.` };
  }

  const resumed = transitionRunStatus(runId, "running", "executing", {
    error: "",
  });

  if (!resumed) {
    return { ok: false, statusCode: 409, error: "Failed to transition run state." };
  }

  emitRuntimeEvent("run:resumed", runId, run.agentId, run.agentName, {
    previousStatus: run.status,
  });

  return {
    ok: true,
    statusCode: 200,
    run: serializeCommandRun(resumed),
  };
}

function cancelCommandRun(runId) {
  const child = activeCommandProcesses.get(runId);
  const run = runtimeState.commandRuns.find((entry) => entry.id === runId);

  if (!run) {
    return { ok: false, statusCode: 404, error: "Run not found" };
  }

  if (!child) {
    return {
      ok: false,
      statusCode: 409,
      error: run.status === "running" ? "Run process is no longer available." : "Run is not active.",
      run: serializeCommandRun(run),
    };
  }

  const canceledAt = new Date().toISOString();
  updateCommandRun(runId, (currentRun) => ({
    ...currentRun,
    status: "canceled",
    phase: "canceled",
    completedAt: canceledAt,
    canceledAt,
    durationMs: currentRun.startedAt ? Date.now() - new Date(currentRun.startedAt).getTime() : currentRun.durationMs,
    error: currentRun.error || "Canceled by user.",
  }));

  emitRuntimeEvent("run:canceled", runId, run.agentId, run.agentName, {
    durationMs: run.startedAt ? Date.now() - new Date(run.startedAt).getTime() : null,
  });

  child.kill("SIGTERM");
  setTimeout(() => {
    if (!child.killed) {
      child.kill("SIGKILL");
    }
  }, 2000).unref();

  return {
    ok: true,
    statusCode: 200,
    run: serializeCommandRun(runtimeState.commandRuns.find((entry) => entry.id === runId)),
  };
}

async function runCommand(body) {
  const agent = body?.agent;
  const command = typeof body?.command === "string" ? body.command.trim() : "";
  const timeoutMs = Number(body?.timeoutMs || defaultTimeoutMs);

  if (!command) {
    throw new Error("A command string is required.");
  }

  const { cwd } = validateCommand(agent, command, body?.cwd);
  const run = createCommandRun(agent, command, cwd, { status: "running", phase: "executing" });
  upsertCommandRun(run);

  emitRuntimeEvent("run:started", run.id, run.agentId, run.agentName, {
    command,
    cwd,
    activity: run.activity,
  });

  return new Promise((resolvePromise, rejectPromise) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let canceled = false;

    const child = spawn(process.env.SHELL || "/bin/zsh", ["-lc", command], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeCommandProcesses.set(run.id, child);

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      updateCommandRun(run.id, (currentRun) => ({
        ...currentRun,
        stdout: `${currentRun.stdout}${text}`,
      }));
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      updateCommandRun(run.id, (currentRun) => ({
        ...currentRun,
        stderr: `${currentRun.stderr}${text}`,
      }));
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      activeCommandProcesses.delete(run.id);
      updateCommandRun(run.id, (currentRun) => ({
        ...currentRun,
        status: "failed",
        phase: "failed",
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown runtime error",
      }));
      rejectPromise(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      activeCommandProcesses.delete(run.id);
      const currentRun = runtimeState.commandRuns.find((entry) => entry.id === run.id);
      canceled = currentRun?.status === "canceled";
      const artifacts = extractArtifactsFromCommandResult(command, cwd, stdout, stderr);
      const result = {
        ok: !timedOut && !canceled && (code ?? 1) === 0,
        exitCode: code ?? 1,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        timedOut,
        durationMs: Date.now() - startedAt,
        cwd,
        runId: run.id,
        activity: run.activity,
        canceled,
        artifacts,
      };

      const finalStatus = canceled ? "canceled" : result.ok ? "completed" : "failed";

      updateCommandRun(run.id, (currentRun) => ({
        ...currentRun,
        status: finalStatus,
        phase: finalStatus,
        completedAt: new Date().toISOString(),
        durationMs: result.durationMs,
        exitCode: result.exitCode,
        timedOut: result.timedOut,
        stdout: stdout,
        stderr: stderr,
        artifacts,
      }));

      emitRuntimeEvent(`run:${finalStatus === "completed" ? "completed" : finalStatus}`, run.id, run.agentId, run.agentName, {
        exitCode: result.exitCode,
        durationMs: result.durationMs,
        timedOut: result.timedOut,
        ok: result.ok,
        canceled,
      });

      resolvePromise(result);
    });
  });
}

async function runCommandStream(request, response, body) {
  const agent = body?.agent;
  const command = typeof body?.command === "string" ? body.command.trim() : "";
  const timeoutMs = Number(body?.timeoutMs || defaultTimeoutMs);

  if (!command) {
    throw new Error("A command string is required.");
  }

  const { cwd } = validateCommand(agent, command, body?.cwd);
  const run = createCommandRun(agent, command, cwd, { status: "running", phase: "executing" });
  upsertCommandRun(run);
  writeNdjsonHeaders(response);

  emitRuntimeEvent("run:started", run.id, run.agentId, run.agentName, {
    command,
    cwd,
    activity: run.activity,
  });

  return new Promise((resolvePromise, rejectPromise) => {
    const startedAt = Date.now();
    const startedAtIso = new Date(startedAt).toISOString();
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    let canceled = false;

    const child = spawn(process.env.SHELL || "/bin/zsh", ["-lc", command], {
      cwd,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    activeCommandProcesses.set(run.id, child);

    const finish = (payload) => {
      if (settled) {
        return;
      }

      settled = true;
      writeNdjsonEvent(response, payload);
      response.end();
      resolvePromise();
    };

    const fail = (error) => {
      if (settled) {
        return;
      }

      settled = true;
      activeCommandProcesses.delete(run.id);
      updateCommandRun(run.id, (currentRun) => ({
        ...currentRun,
        status: "failed",
        phase: "failed",
        completedAt: new Date().toISOString(),
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Unknown runtime error",
      }));
      writeNdjsonEvent(response, {
        type: "error",
        runId: run.id,
        phase: "failed",
        activity: run.activity,
        error: error instanceof Error ? error.message : "Unknown runtime error",
      });
      response.end();
      rejectPromise(error);
    };

    writeNdjsonEvent(response, {
      type: "started",
      runId: run.id,
      phase: "running",
      cwd,
      command,
      startedAt: startedAtIso,
      activity: run.activity,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      updateCommandRun(run.id, (currentRun) => ({
        ...currentRun,
        stdout: `${currentRun.stdout}${text}`,
      }));
      writeNdjsonEvent(response, {
        type: "stdout",
        runId: run.id,
        phase: "running",
        activity: run.activity,
        chunk: text,
      });
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      updateCommandRun(run.id, (currentRun) => ({
        ...currentRun,
        stderr: `${currentRun.stderr}${text}`,
      }));
      writeNdjsonEvent(response, {
        type: "stderr",
        runId: run.id,
        phase: "running",
        activity: run.activity,
        chunk: text,
      });
    });

    child.on("error", (error) => {
      clearTimeout(timer);
      fail(error);
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      activeCommandProcesses.delete(run.id);
      const currentRun = runtimeState.commandRuns.find((entry) => entry.id === run.id);
      canceled = currentRun?.status === "canceled";
      const finishedAtIso = new Date().toISOString();
      const durationMs = Date.now() - startedAt;
      const ok = !timedOut && !canceled && (code ?? 1) === 0;
      const artifacts = extractArtifactsFromCommandResult(command, cwd, stdout, stderr);

      const finalStatus = canceled ? "canceled" : ok ? "completed" : "failed";
      const finalPhase = canceled ? "canceled" : ok ? "completed" : "failed";

      updateCommandRun(run.id, (currentRun) => ({
        ...currentRun,
        status: finalStatus,
        phase: finalPhase,
        completedAt: finishedAtIso,
        durationMs,
        exitCode: code ?? 1,
        timedOut,
        stdout,
        stderr,
        artifacts,
      }));

      artifacts.forEach((artifact) => {
        emitRuntimeEvent("run:artifact", run.id, agent?.id || "unknown-agent", agent?.name || "Unknown Agent", {
          artifact,
        });
      });

      emitRuntimeEvent(`run:${finalStatus === "completed" ? "completed" : finalStatus}`, run.id, agent?.id || "unknown-agent", agent?.name || "Unknown Agent", {
        exitCode: code ?? 1,
        durationMs,
        timedOut,
        ok,
        canceled,
      });

      finish({
        type: "completed",
        runId: run.id,
        phase: canceled ? "canceled" : ok ? "completed" : "failed",
        activity: run.activity,
        ok,
        exitCode: code ?? 1,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        timedOut,
        durationMs,
        cwd,
        completedAt: finishedAtIso,
        canceled,
        artifacts,
      });
    });

    response.on("close", () => {
      if (!settled && !child.killed) {
        child.kill("SIGTERM");
      }
    });
  });
}

const TOOL_DEFINITIONS = [
  {
    name: "browser.fetch",
    category: "browser",
    description: "Fetch a web page and return HTML plus basic metadata.",
    riskLevel: "medium",
    requiresApproval: true,
    parameters: [
      { name: "url", type: "string", required: true },
      { name: "timeout", type: "number", required: false, default: 30000 },
    ],
  },
  {
    name: "browser.extract",
    category: "browser",
    description: "Fetch a web page and extract readable text for lightweight scraping.",
    riskLevel: "medium",
    requiresApproval: true,
    parameters: [
      { name: "url", type: "string", required: true },
      { name: "maxChars", type: "number", required: false, default: 12000 },
      { name: "timeout", type: "number", required: false, default: 30000 },
    ],
  },
  {
    name: "browser.run",
    category: "browser",
    description: "Run a full Browser Use cloud agent task that can navigate, click, type, read pages, and return a final result.",
    riskLevel: "medium",
    requiresApproval: true,
    parameters: [
      { name: "task", type: "string", required: true },
      { name: "timeout", type: "number", required: false, default: 180000 },
      { name: "model", type: "string", required: false },
      { name: "maxCostUsd", type: "string", required: false },
    ],
  },
  {
    name: "gmail.draft",
    category: "connector",
    description: "Create a Gmail draft through the connected Composio Gmail account.",
    riskLevel: "medium",
    requiresApproval: false,
    parameters: [
      { name: "to", type: "string", required: true },
      { name: "subject", type: "string", required: true },
      { name: "body", type: "string", required: true },
      { name: "cc", type: "string", required: false },
      { name: "bcc", type: "string", required: false },
    ],
  },
  {
    name: "gmail.send",
    category: "connector",
    description: "Send a Gmail message through the connected Composio Gmail account.",
    riskLevel: "high",
    requiresApproval: true,
    parameters: [
      { name: "to", type: "string", required: true },
      { name: "subject", type: "string", required: true },
      { name: "body", type: "string", required: true },
      { name: "cc", type: "string", required: false },
      { name: "bcc", type: "string", required: false },
    ],
  },
  {
    name: "filesystem.read",
    category: "filesystem",
    description: "Read file contents from the workspace.",
    riskLevel: "safe",
    requiresApproval: false,
    parameters: [
      { name: "path", type: "string", required: true },
      { name: "encoding", type: "string", required: false, default: "utf-8" },
      { name: "offset", type: "number", required: false },
      { name: "limit", type: "number", required: false },
    ],
  },
  {
    name: "filesystem.write",
    category: "filesystem",
    description: "Write or create a file in the workspace.",
    riskLevel: "high",
    requiresApproval: true,
    parameters: [
      { name: "path", type: "string", required: true },
      { name: "content", type: "string", required: true },
      { name: "createOnly", type: "boolean", required: false, default: false },
    ],
  },
  {
    name: "filesystem.list",
    category: "filesystem",
    description: "List files and directories in a workspace path.",
    riskLevel: "safe",
    requiresApproval: false,
    parameters: [
      { name: "path", type: "string", required: false, default: "." },
      { name: "recursive", type: "boolean", required: false, default: false },
      { name: "maxDepth", type: "number", required: false, default: 3 },
    ],
  },
  {
    name: "code.search",
    category: "code",
    description: "Search for patterns in workspace code files.",
    riskLevel: "safe",
    requiresApproval: false,
    parameters: [
      { name: "pattern", type: "string", required: true },
      { name: "path", type: "string", required: false, default: "." },
      { name: "filePattern", type: "string", required: false, default: "*" },
      { name: "maxResults", type: "number", required: false, default: 50 },
    ],
  },
  {
    name: "git.status",
    category: "git",
    description: "Show the working tree status.",
    riskLevel: "safe",
    requiresApproval: false,
    parameters: [],
  },
  {
    name: "git.diff",
    category: "git",
    description: "Show changes between commits, commit and working tree, etc.",
    riskLevel: "safe",
    requiresApproval: false,
    parameters: [
      { name: "cached", type: "boolean", required: false, default: false },
      { name: "path", type: "string", required: false },
      { name: "ref", type: "string", required: false },
    ],
  },
  {
    name: "git.log",
    category: "git",
    description: "Show commit logs.",
    riskLevel: "safe",
    requiresApproval: false,
    parameters: [
      { name: "maxCount", type: "number", required: false, default: 20 },
      { name: "path", type: "string", required: false },
      { name: "format", type: "string", required: false, default: "oneline" },
    ],
  },
  {
    name: "shell.exec",
    category: "shell",
    description: "Execute a shell command in the workspace sandbox.",
    riskLevel: "high",
    requiresApproval: true,
    parameters: [
      { name: "command", type: "string", required: true },
      { name: "cwd", type: "string", required: false },
      { name: "timeout", type: "number", required: false, default: 120000 },
    ],
  },
  {
    name: "http.request",
    category: "http",
    description: "Make an HTTP request to an external URL.",
    riskLevel: "medium",
    requiresApproval: true,
    parameters: [
      { name: "url", type: "string", required: true },
      { name: "method", type: "string", required: false, default: "GET" },
      { name: "headers", type: "object", required: false },
      { name: "body", type: "string", required: false },
      { name: "timeout", type: "number", required: false, default: 30000 },
    ],
  },
  {
    name: "delegate.task",
    category: "delegation",
    description: "Delegate a task to another agent in the workspace.",
    riskLevel: "low",
    requiresApproval: false,
    parameters: [
      { name: "assigneeId", type: "string", required: true },
      { name: "title", type: "string", required: true },
      { name: "payload", type: "string", required: false },
      { name: "executionMode", type: "string", required: false, default: "thread" },
      { name: "priority", type: "string", required: false, default: "medium" },
    ],
  },
];

const toolApprovalRequests = new Map();

function validateToolParameters(toolName, parameters) {
  const definition = TOOL_DEFINITIONS.find((t) => t.name === toolName);
  if (!definition) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const validated = {};
  const errors = [];

  for (const param of definition.parameters) {
    const value = parameters[param.name];

    if (value === undefined || value === null) {
      if (param.required) {
        errors.push(`Missing required parameter: ${param.name}`);
        continue;
      }
      if (param.default !== undefined) {
        validated[param.name] = param.default;
      }
      continue;
    }

    if (param.type === "string" && typeof value !== "string") {
      errors.push(`Parameter ${param.name} must be a string.`);
      continue;
    }
    if (param.type === "number" && typeof value !== "number") {
      errors.push(`Parameter ${param.name} must be a number.`);
      continue;
    }
    if (param.type === "boolean" && typeof value !== "boolean") {
      errors.push(`Parameter ${param.name} must be a boolean.`);
      continue;
    }
    if (param.type === "object" && (typeof value !== "object" || Array.isArray(value))) {
      errors.push(`Parameter ${param.name} must be an object.`);
      continue;
    }

    if (param.enum && !param.enum.includes(value)) {
      errors.push(`Parameter ${param.name} must be one of: ${param.enum.join(", ")}`);
      continue;
    }

    validated[param.name] = value;
  }

  if (errors.length > 0) {
    throw new Error(`Tool parameter validation failed: ${errors.join("; ")}`);
  }

  return validated;
}

function checkToolApprovalNeeded(toolName, parameters, agent, sandboxMode) {
  const definition = TOOL_DEFINITIONS.find((t) => t.name === toolName);
  if (!definition) return { needed: false };

  if (!definition.requiresApproval) {
    return { needed: false };
  }

  if (sandboxMode === "none") {
    return { needed: false, blocked: true, reason: "Sandbox mode is disabled for this agent." };
  }

  if (toolName === "shell.exec") {
    const command = parameters.command || "";
    for (const pattern of blockedCommandPatterns) {
      if (pattern.test(command)) {
        return { needed: false, blocked: true, reason: "This command is blocked by the local sandbox policy." };
      }
    }

    if (sandboxMode === "read-only") {
      if (/[|;&><`$]/.test(command)) {
        return { needed: false, blocked: true, reason: "Read-only mode blocks shell operators." };
      }
      const baseCommand = command.trim().split(/\s+/)[0];
      if (!readOnlyCommands.has(baseCommand)) {
        return { needed: false, blocked: true, reason: `Read-only mode does not allow "${baseCommand}".` };
      }
    }

    const reasons = commandApprovalPatterns
      .filter((entry) => entry.pattern.test(command))
      .map((entry) => entry.reason);

    if (shellRiskPattern.test(command)) {
      reasons.push("It uses shell operators, redirection, or variable expansion.");
    }

    if (reasons.length > 0) {
      return {
        needed: true,
        reasons,
        preview: { command, filePaths: [], diff: undefined, url: undefined, method: undefined },
      };
    }

    return { needed: false };
  }

  if (toolName === "filesystem.write") {
    const filePath = parameters.path || "";
    const reasons = [];

    if (!parameters.createOnly) {
      reasons.push("It may overwrite an existing file.");
    }

    if (reasons.length > 0) {
      return {
        needed: true,
        reasons,
        preview: {
          command: undefined,
          filePaths: [filePath],
          diff: parameters.content ? `--- a/${filePath}\n+++ b/${filePath}\n${parameters.content.slice(0, 500)}` : undefined,
          url: undefined,
          method: undefined,
        },
      };
    }

    return { needed: false };
  }

  if (toolName === "http.request") {
    const url = parameters.url || "";
    const method = parameters.method || "GET";
    const reasons = [`It makes a ${method} request to an external URL.`];

    return {
      needed: true,
      reasons,
      preview: {
        command: undefined,
        filePaths: [],
        diff: undefined,
        url,
        method,
      },
    };
  }

  if (toolName === "gmail.send") {
    const to = `${parameters.to || ""}`.trim();
    const subject = `${parameters.subject || ""}`.trim();
    const body = `${parameters.body || ""}`.trim();
    return {
      needed: true,
      reasons: [
        "It will send an email from your connected Gmail account.",
      ],
      preview: {
        summary: [
          `To: ${to || "(missing recipient)"}`,
          `Subject: ${subject || "(missing subject)"}`,
          "",
          body.slice(0, 600),
        ].join("\n"),
      },
    };
  }

  if (toolName === "browser.fetch" || toolName === "browser.extract" || toolName === "browser.run") {
    const url = parameters.url || "";
    return {
      needed: true,
      reasons: [
        toolName === "browser.run"
          ? "It launches an autonomous Browser Use cloud session that can navigate, click, type, and read pages."
          : "It fetches external web content for browsing or scraping.",
      ],
      preview: {
        command: undefined,
        filePaths: [],
        diff: undefined,
        url: toolName === "browser.run" ? undefined : url,
        method: "GET",
      },
    };
  }

  if (definition.requiresApproval) {
    return {
      needed: true,
      reasons: [`Tool "${toolName}" requires approval before execution.`],
      preview: { command: undefined, filePaths: [], diff: undefined, url: undefined, method: undefined },
    };
  }

  return { needed: false };
}

function createToolApprovalRequest(toolName, agentId, agentName, parameters, reasons, preview) {
  const id = `approval_${randomUUID()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

  const approvalRequest = {
    id,
    tool: toolName,
    agentId,
    agentName,
    parameters,
    riskLevel: TOOL_DEFINITIONS.find((t) => t.name === toolName)?.riskLevel || "medium",
    reasons,
    preview: preview || {},
    requestedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  toolApprovalRequests.set(id, approvalRequest);
  return approvalRequest;
}

async function executeToolInternal(toolName, parameters, agent, workspacePath) {
  const workspace = resolve(workspacePath || agent?.workspace || process.cwd());
  const startedAt = Date.now();

  const extractPageMetadata = (html, maxChars = 12000) => {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch?.[1]?.replace(/\s+/g, " ").trim() || "";
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/\s+/g, " ")
      .trim();

    return {
      title,
      text: text.slice(0, maxChars),
      textExcerpt: text.slice(0, 4000),
    };
  };

  if (toolName === "browser.fetch" || toolName === "browser.extract") {
    const url = parameters.url || "";
    const timeoutMs = parameters.timeout || 30000;

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      throw new Error("Only http:// and https:// URLs are allowed.");
    }

    const fetchResponse = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    const html = await fetchResponse.text();
    const metadata = extractPageMetadata(html, parameters.maxChars || 12000);

    return {
      ok: fetchResponse.ok,
      tool: toolName,
      data:
        toolName === "browser.fetch"
          ? {
              url,
              status: fetchResponse.status,
              title: metadata.title,
              html: trimOutput(html, 50000),
              textExcerpt: metadata.textExcerpt,
              durationMs: Date.now() - startedAt,
            }
          : {
              url,
              status: fetchResponse.status,
              title: metadata.title,
              text: metadata.text,
              durationMs: Date.now() - startedAt,
            },
    };
  }

  if (toolName === "browser.run") {
    const task = parameters.task || "";
    const timeoutMs = parameters.timeout || 180000;
    if (!browserUseApiKey) {
      throw new Error("BROWSER_USE_API_KEY is missing in the local runtime environment.");
    }

    let session = await createBrowserUseSession({
      task,
      agentId: agent?.id || "",
      agentName: agent?.name || "",
      model: parameters.model || browserUseModel,
      maxCostUsd: parameters.maxCostUsd || browserUseMaxCostUsd,
    });

    const deadline = Date.now() + timeoutMs;
    while (!isBrowserUseTerminalStatus(session.status) && Date.now() < deadline) {
      await new Promise((resolvePromise) => setTimeout(resolvePromise, 4000));
      session = await getBrowserUseSession(session.id);
    }

    const output = browserUseSessionOutput(session);
    return {
      ok: !["failed", "error", "timed_out", "timeout"].includes(String(session.status).toLowerCase()),
      tool: toolName,
      data: {
        sessionId: session.id,
        status: session.status,
        liveUrl: session.liveUrl,
        output,
        model: session.model,
        totalCostUsd: session.totalCostUsd,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  if (toolName === "gmail.send") {
    return await sendGmailMessage(parameters);
  }

  if (toolName === "gmail.draft") {
    return await draftGmailMessage(parameters);
  }

  if (toolName === "filesystem.read") {
    const { readFile, stat, readdir } = await import("node:fs/promises");
    const targetPath = resolve(workspace, parameters.path || ".");

    if (!isPathInsideWorkspace(workspace, targetPath)) {
      throw new Error("The requested path is outside the agent workspace.");
    }

    try {
      const stats = await stat(targetPath);

      if (stats.isDirectory()) {
        const entries = await readdir(targetPath, { withFileTypes: true });
        return {
          ok: true,
          tool: toolName,
          data: {
            path: parameters.path,
            type: "directory",
            entries: entries.map((e) => ({ name: e.name, type: e.isDirectory() ? "directory" : "file" })),
            durationMs: Date.now() - startedAt,
          },
        };
      }

      let content = await readFile(targetPath, { encoding: parameters.encoding || "utf-8" });

      if (parameters.offset || parameters.limit) {
        const lines = content.split("\n");
        const start = Math.max(0, (parameters.offset || 1) - 1);
        const end = parameters.limit ? start + parameters.limit : lines.length;
        content = lines.slice(start, end).join("\n");
      }

      return {
        ok: true,
        tool: toolName,
        data: {
          path: parameters.path,
          content,
          size: stats.size,
          lines: content.split("\n").length,
          durationMs: Date.now() - startedAt,
        },
      };
    } catch (err) {
      throw new Error(`Failed to read ${parameters.path}: ${err.message}`);
    }
  }

  if (toolName === "filesystem.write") {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const targetPath = resolve(workspace, parameters.path || "");

    if (!isPathInsideWorkspace(workspace, targetPath)) {
      throw new Error("The requested path is outside the agent workspace.");
    }

    if (parameters.createOnly) {
      const { access } = await import("node:fs/promises");
      try {
        await access(targetPath);
        throw new Error(`File already exists: ${parameters.path}`);
      } catch (err) {
        if (err.message !== `File already exists: ${parameters.path}` && err.code !== "ENOENT") {
          throw err;
        }
        if (err.message === `File already exists: ${parameters.path}`) {
          throw err;
        }
      }
    }

    await mkdir(resolve(targetPath, ".."), { recursive: true });
    await writeFile(targetPath, parameters.content || "", { encoding: "utf-8" });

    return {
      ok: true,
      tool: toolName,
      data: {
        path: parameters.path,
        created: true,
        bytesWritten: Buffer.byteLength(parameters.content || "", "utf-8"),
        durationMs: Date.now() - startedAt,
      },
    };
  }

  if (toolName === "filesystem.list") {
    const { readdir, stat } = await import("node:fs/promises");
    const targetPath = resolve(workspace, parameters.path || ".");

    if (!isPathInsideWorkspace(workspace, targetPath)) {
      throw new Error("The requested path is outside the agent workspace.");
    }

    async function listDir(dirPath, depth, maxDepth) {
      const entries = await readdir(dirPath, { withFileTypes: true });
      const result = [];

      for (const entry of entries) {
        if (entry.name.startsWith(".") && entry.name !== ".env.example") continue;

        const entryPath = resolve(dirPath, entry.name);
        const isDir = entry.isDirectory();
        result.push({
          name: entry.name,
          path: relative(workspace, entryPath),
          type: isDir ? "directory" : "file",
        });

        if (isDir && parameters.recursive && depth < maxDepth) {
          try {
            const children = await listDir(entryPath, depth + 1, maxDepth);
            result.push(...children);
          } catch {}
        }
      }

      return result;
    }

    const entries = await listDir(targetPath, 0, parameters.maxDepth || 3);

    return {
      ok: true,
      tool: toolName,
      data: {
        path: parameters.path || ".",
        entries,
        totalFiles: entries.filter((e) => e.type === "file").length,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  if (toolName === "code.search") {
    const { execSync } = await import("node:child_process");
    const pattern = parameters.pattern || "";
    const searchPath = resolve(workspace, parameters.path || ".");
    const maxResults = parameters.maxResults || 50;

    if (!isPathInsideWorkspace(workspace, searchPath)) {
      throw new Error("The search path is outside the agent workspace.");
    }

    let grepCommand;
    if (process.platform === "darwin" || process.platform === "linux") {
      const filePattern = parameters.filePattern || "*";
      if (filePattern !== "*") {
        grepCommand = `rg --no-heading --line-number --max-count ${maxResults} --glob "${filePattern}" ${parameters.caseSensitive !== true ? "-i" : ""} -- "${pattern.replace(/"/g, '\\"')}" "${searchPath}" 2>/dev/null || true`;
      } else {
        grepCommand = `rg --no-heading --line-number --max-count ${maxResults} ${parameters.caseSensitive !== true ? "-i" : ""} -- "${pattern.replace(/"/g, '\\"')}" "${searchPath}" 2>/dev/null || true`;
      }
    } else {
      grepCommand = `findstr /n ${parameters.caseSensitive === true ? "" : "/i"} "${pattern.replace(/"/g, '\\"')}" "${searchPath}\\*" 2>nul || echo No results`;
    }

    const rawOutput = execSync(grepCommand, {
      cwd: workspace,
      timeout: 15000,
      encoding: "utf-8",
      maxBuffer: 1024 * 1024,
    }).trim();

    const results = rawOutput
      .split("\n")
      .filter(Boolean)
      .slice(0, maxResults)
      .map((line) => {
        const match = line.match(/^(.+?):(\d+):(.*)$/);
        if (match) {
          return { file: match[1], line: Number(match[2]), text: match[3].trim() };
        }
        return { file: "", line: 0, text: line.trim() };
      })
      .filter((r) => r.file);

    return {
      ok: true,
      tool: toolName,
      data: {
        pattern,
        results,
        totalMatches: results.length,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  if (toolName === "git.status") {
    const { execSync } = await import("node:child_process");

    const rawStatus = execSync("git status --porcelain=v2 --branch", {
      cwd: workspace,
      encoding: "utf-8",
      timeout: 10000,
    }).trim();

    const branchMatch = rawStatus.match(/^# branch\.head\s+(.+)$/m);
    const aheadMatch = rawStatus.match(/^# branch\.ab\s+\+(\d+)/m);
    const behindMatch = rawStatus.match(/^# branch\.ab\s+-(\d+)/m);

    const staged = [];
    const unstaged = [];
    const untracked = [];

    for (const line of rawStatus.split("\n")) {
      if (line.startsWith("1 ")) {
        const xy = line.slice(2, 4);
        const filePath = line.slice(3).trim().split(" ").pop();
        if (xy[0] !== "." && xy[0] !== "?") staged.push({ path: filePath, status: xy[0] });
        if (xy[1] !== "." && xy[1] !== "?") unstaged.push({ path: filePath, status: xy[1] });
      }
      if (line.startsWith("? ")) {
        untracked.push({ path: line.slice(2).trim() });
      }
    }

    return {
      ok: true,
      tool: toolName,
      data: {
        branch: branchMatch?.[1] || "unknown",
        staged,
        unstaged,
        untracked,
        ahead: Number(aheadMatch?.[1] || 0),
        behind: Number(behindMatch?.[1] || 0),
        durationMs: Date.now() - startedAt,
      },
    };
  }

  if (toolName === "git.diff") {
    const { execSync } = await import("node:child_process");

    let diffCommand = "git diff";
    if (parameters.cached) diffCommand += " --cached";
    if (parameters.ref) diffCommand += ` ${parameters.ref}`;
    if (parameters.path) diffCommand += ` -- "${parameters.path}"`;

    const rawDiff = execSync(diffCommand, {
      cwd: workspace,
      encoding: "utf-8",
      timeout: 15000,
      maxBuffer: 1024 * 1024,
    }).trim();

    const filesChanged = (rawDiff.match(/^diff --git /gm) || []).length;
    const insertions = (rawDiff.match(/^\+[^+]/gm) || []).length;
    const deletions = (rawDiff.match(/^-[^-]/gm) || []).length;

    return {
      ok: true,
      tool: toolName,
      data: {
        diff: rawDiff,
        filesChanged,
        insertions,
        deletions,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  if (toolName === "git.log") {
    const { execSync } = await import("node:child_process");

    let logCommand = `git log --format=${parameters.format || "oneline"} -${parameters.maxCount || 20}`;
    if (parameters.path) logCommand += ` -- "${parameters.path}"`;

    const rawLog = execSync(logCommand, {
      cwd: workspace,
      encoding: "utf-8",
      timeout: 10000,
    }).trim();

    const commits = rawLog.split("\n").filter(Boolean).map((line) => {
      const [hash, ...rest] = line.split(" ");
      return { hash, message: rest.join(" ") };
    });

    return {
      ok: true,
      tool: toolName,
      data: {
        commits,
        total: commits.length,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  if (toolName === "shell.exec") {
    const command = parameters.command || "";
    const cwd = resolve(workspace, parameters.cwd || ".");
    const timeoutMs = parameters.timeout || defaultTimeoutMs;

    if (!isPathInsideWorkspace(workspace, cwd)) {
      throw new Error("The requested cwd is outside the agent workspace.");
    }

    return new Promise((resolvePromise) => {
      const startedAtInner = Date.now();
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const child = spawn(process.env.SHELL || "/bin/zsh", ["-lc", command], {
        cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 2000).unref();
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        resolvePromise({
          ok: false,
          tool: toolName,
          data: {
            exitCode: 1,
            stdout: trimOutput(stdout),
            stderr: trimOutput(stderr),
            timedOut: false,
            durationMs: Date.now() - startedAtInner,
            error: error.message,
          },
        });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const ok = !timedOut && (code ?? 1) === 0;
        resolvePromise({
          ok,
          tool: toolName,
          data: {
            exitCode: code ?? 1,
            stdout: trimOutput(stdout),
            stderr: trimOutput(stderr),
            timedOut,
            durationMs: Date.now() - startedAtInner,
          },
        });
      });
    });
  }

  if (toolName === "http.request") {
    const url = parameters.url || "";
    const method = (parameters.method || "GET").toUpperCase();
    const timeoutMs = parameters.timeout || 30000;

    if (!url.startsWith("http://") && !url.startsWith("https://")) {
      throw new Error("Only http:// and https:// URLs are allowed.");
    }

    const fetchOptions = {
      method,
      headers: parameters.headers || {},
      signal: AbortSignal.timeout(timeoutMs),
    };

    if (parameters.body && ["POST", "PUT", "PATCH"].includes(method)) {
      fetchOptions.body = parameters.body;
      if (!fetchOptions.headers["Content-Type"]) {
        fetchOptions.headers["Content-Type"] = "application/json";
      }
    }

    const fetchResponse = await fetch(url, fetchOptions);
    const responseBody = await fetchResponse.text();

    return {
      ok: fetchResponse.ok,
      tool: toolName,
      data: {
        status: fetchResponse.status,
        statusText: fetchResponse.statusText,
        headers: Object.fromEntries(fetchResponse.headers.entries()),
        body: trimOutput(responseBody, 50000),
        durationMs: Date.now() - startedAt,
      },
    };
  }

  if (toolName === "delegate.task") {
    return {
      ok: true,
      tool: toolName,
      data: {
        taskId: `delegation_${randomUUID()}`,
        status: "queued",
        assigneeId: parameters.assigneeId || "",
        title: parameters.title || "",
        executionMode: parameters.executionMode || "thread",
        priority: parameters.priority || "medium",
        durationMs: Date.now() - startedAt,
      },
    };
  }

  throw new Error(`Tool implementation not found: ${toolName}`);
}

async function handleToolInvocation(body) {
  const { tool: toolName, agentId, parameters: rawParameters, workspacePath, sandboxMode, approvalToken } = body;

  if (!toolName) {
    throw new Error("Tool name is required.");
  }

  const definition = TOOL_DEFINITIONS.find((t) => t.name === toolName);
  if (!definition) {
    throw new Error(`Unknown tool: ${toolName}`);
  }

  const agent = runtimeState.commandRuns.length > 0
    ? { id: agentId || "unknown", name: agentId || "Unknown", workspace: workspacePath || "" }
    : { id: agentId || "unknown", name: agentId || "Unknown", workspace: workspacePath || "" };

  const parameters = validateToolParameters(toolName, rawParameters || {});

  if (sandboxMode === "none" && definition.category !== "delegation") {
    const writeTools = ["filesystem.write", "shell.exec", "http.request"];
    if (writeTools.includes(toolName)) {
      throw new Error(`Tool "${toolName}" is not allowed with sandbox mode "none".`);
    }
  }

  if (sandboxMode === "read-only") {
    const writeTools = ["filesystem.write", "shell.exec", "http.request"];
    if (writeTools.includes(toolName)) {
      throw new Error(`Tool "${toolName}" is not allowed with sandbox mode "read-only".`);
    }

    if (toolName === "delegate.task" && parameters.executionMode === "command") {
      throw new Error('Command delegations are not allowed with sandbox mode "read-only".');
    }
  }

  if (definition.requiresApproval && !approvalToken) {
    const approvalCheck = checkToolApprovalNeeded(toolName, parameters, agent, sandboxMode);

    if (approvalCheck.blocked) {
      return {
        ok: false,
        tool: toolName,
        error: approvalCheck.reason,
      };
    }

    if (approvalCheck.needed) {
      const approvalRequest = createToolApprovalRequest(
        toolName,
        agentId || "unknown",
        agent?.name || "Unknown Agent",
        parameters,
        approvalCheck.reasons,
        approvalCheck.preview,
      );

      return {
        ok: false,
        tool: toolName,
        approvalRequired: true,
        approvalRequestId: approvalRequest.id,
        approvalReasons: approvalCheck.reasons,
        preview: approvalRequest.preview,
      };
    }
  }

  if (approvalToken) {
    const approval = toolApprovalRequests.get(approvalToken);
    if (!approval) {
      return {
        ok: false,
        tool: toolName,
        error: "Approval request not found or expired.",
      };
    }
    toolApprovalRequests.delete(approvalToken);
  }

  const result = await executeToolInternal(toolName, parameters, agent, workspacePath);
  return result;
}

async function handleToolInvocationStream(request, response, body) {
  const { tool: toolName, agentId, parameters: rawParameters, workspacePath, sandboxMode, approvalToken } = body;

  if (!toolName) {
    sendJson(response, 400, { ok: false, error: "Tool name is required." });
    return;
  }

  const definition = TOOL_DEFINITIONS.find((t) => t.name === toolName);
  if (!definition) {
    sendJson(response, 400, { ok: false, error: `Unknown tool: ${toolName}` });
    return;
  }

  const parameters = validateToolParameters(toolName, rawParameters || {});
  const agent = { id: agentId || "unknown", name: agentId || "Unknown", workspace: workspacePath || "" };

  if (sandboxMode === "read-only" && toolName === "delegate.task" && parameters.executionMode === "command") {
    sendJson(response, 403, {
      ok: false,
      tool: toolName,
      error: 'Command delegations are not allowed with sandbox mode "read-only".',
    });
    return;
  }

  if (definition.requiresApproval && !approvalToken) {
    const approvalCheck = checkToolApprovalNeeded(toolName, parameters, agent, sandboxMode);

    if (approvalCheck.blocked) {
      sendJson(response, 403, { ok: false, tool: toolName, error: approvalCheck.reason });
      return;
    }

    if (approvalCheck.needed) {
      const approvalRequest = createToolApprovalRequest(
        toolName,
        agentId || "unknown",
        agent?.name || "Unknown Agent",
        parameters,
        approvalCheck.reasons,
        approvalCheck.preview,
      );

      writeNdjsonHeaders(response);
      writeNdjsonEvent(response, {
        type: "approval_required",
        tool: toolName,
        approvalRequestId: approvalRequest.id,
        reasons: approvalCheck.reasons,
        preview: approvalCheck.preview,
      });
      response.end();
      return;
    }
  }

  if (approvalToken) {
    const approval = toolApprovalRequests.get(approvalToken);
    if (!approval) {
      sendJson(response, 404, { ok: false, tool: toolName, error: "Approval request not found or expired." });
      return;
    }
    toolApprovalRequests.delete(approvalToken);
  }

  writeNdjsonHeaders(response);
  writeNdjsonEvent(response, {
    type: "started",
    tool: toolName,
    agentId: agentId || "unknown",
    timestamp: new Date().toISOString(),
  });

  try {
    if (toolName === "shell.exec") {
      const workspace = resolve(workspacePath || agent?.workspace || process.cwd());
      const command = parameters.command || "";
      const cwd = resolve(workspace, parameters.cwd || ".");
      const timeoutMs = parameters.timeout || defaultTimeoutMs;

      if (!isPathInsideWorkspace(workspace, cwd)) {
        writeNdjsonEvent(response, {
          type: "error",
          tool: toolName,
          error: "The requested cwd is outside the agent workspace.",
        });
        response.end();
        return;
      }

      const startedAt = Date.now();
      let stdout = "";
      let stderr = "";
      let timedOut = false;
      let settled = false;

      const child = spawn(process.env.SHELL || "/bin/zsh", ["-lc", command], {
        cwd,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const finish = (result) => {
        if (settled) return;
        settled = true;
        writeNdjsonEvent(response, {
          type: "completed",
          tool: toolName,
          result,
        });
        response.end();
      };

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 2000).unref();
      }, timeoutMs);

      child.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        stdout += text;
        writeNdjsonEvent(response, {
          type: "stdout",
          tool: toolName,
          chunk: text,
        });
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString();
        stderr += text;
        writeNdjsonEvent(response, {
          type: "stderr",
          tool: toolName,
          chunk: text,
        });
      });

      child.on("error", (error) => {
        clearTimeout(timer);
        writeNdjsonEvent(response, {
          type: "error",
          tool: toolName,
          error: error.message,
        });
        response.end();
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const ok = !timedOut && (code ?? 1) === 0;
        finish({
          ok,
          tool: toolName,
          data: {
            exitCode: code ?? 1,
            stdout: trimOutput(stdout),
            stderr: trimOutput(stderr),
            timedOut,
            durationMs: Date.now() - startedAt,
          },
        });
      });

      response.on("close", () => {
        if (!settled && !child.killed) {
          child.kill("SIGTERM");
        }
      });
    } else {
      const result = await executeToolInternal(toolName, parameters, agent, workspacePath);
      writeNdjsonEvent(response, {
        type: "completed",
        tool: toolName,
        result,
      });
      response.end();
    }
  } catch (error) {
    writeNdjsonEvent(response, {
      type: "error",
      tool: toolName,
      error: error.message || "Tool execution failed.",
    });
    response.end();
  }
}

function resolveToolApproval(approvalId, action, editedParameters) {
  const approval = toolApprovalRequests.get(approvalId);
  if (!approval) {
    return { ok: false, error: "Approval request not found or expired." };
  }

  if (new Date(approval.expiresAt) < new Date()) {
    toolApprovalRequests.delete(approvalId);
    return { ok: false, error: "Approval request has expired." };
  }

  if (action === "reject") {
    toolApprovalRequests.delete(approvalId);
    return { ok: true, result: { ok: false, tool: approval.tool, error: "Tool invocation was rejected by the user." } };
  }

  const finalParameters = action === "edit" && editedParameters ? editedParameters : approval.parameters;

  toolApprovalRequests.delete(approvalId);

  return {
    ok: true,
    approvalToken: approvalId,
    tool: approval.tool,
    agentId: approval.agentId,
    parameters: finalParameters,
  };
}

const secretsStore = new Map();
const agentSecretBindings = new Map();
const agentVariables = new Map();

function maskSecretKey(apiKey) {
  if (!apiKey || apiKey.length < 8) return "****";
  return `${apiKey.slice(0, 4)}${"*".repeat(Math.min(apiKey.length - 8, 20))}${apiKey.slice(-4)}`;
}

async function validateProviderKey(provider, apiKey) {
  const startedAt = Date.now();
  try {
    if (provider === "openai") {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      return {
        ok: response.ok,
        latencyMs: Date.now() - startedAt,
        model: "gpt-4.1",
        error: response.ok ? null : `HTTP ${response.status}`,
        checkedAt: new Date().toISOString(),
      };
    }
    if (provider === "anthropic") {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "claude-3-7-sonnet-20250219", max_tokens: 1, messages: [{ role: "user", content: "hi" }] }),
        signal: AbortSignal.timeout(10000),
      });
      const ok = response.ok || response.status === 400;
      return {
        ok,
        latencyMs: Date.now() - startedAt,
        model: "claude-3-7-sonnet",
        error: ok ? null : `HTTP ${response.status}`,
        checkedAt: new Date().toISOString(),
      };
    }
    if (provider === "gemini") {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, {
        signal: AbortSignal.timeout(10000),
      });
      return {
        ok: response.ok,
        latencyMs: Date.now() - startedAt,
        model: "gemini-2.5-flash",
        error: response.ok ? null : `HTTP ${response.status}`,
        checkedAt: new Date().toISOString(),
      };
    }
    if (provider === "groq") {
      const response = await fetch("https://api.groq.com/openai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      return {
        ok: response.ok,
        latencyMs: Date.now() - startedAt,
        model: "llama-3.3-70b-versatile",
        error: response.ok ? null : `HTTP ${response.status}`,
        checkedAt: new Date().toISOString(),
      };
    }
    if (provider === "nvidia") {
      const response = await fetch("https://integrate.api.nvidia.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      return {
        ok: response.ok,
        latencyMs: Date.now() - startedAt,
        model: "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        error: response.ok ? null : `HTTP ${response.status}`,
        checkedAt: new Date().toISOString(),
      };
    }
    if (provider === "openrouter") {
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(10000),
      });
      return {
        ok: response.ok,
        latencyMs: Date.now() - startedAt,
        model: "google/gemini-2.5-pro",
        error: response.ok ? null : `HTTP ${response.status}`,
        checkedAt: new Date().toISOString(),
      };
    }
    return { ok: true, latencyMs: 0, model: null, error: null, checkedAt: new Date().toISOString() };
  } catch (err) {
    return {
      ok: false,
      latencyMs: Date.now() - startedAt,
      model: null,
      error: err.message,
      checkedAt: new Date().toISOString(),
    };
  }
}

function buildRunTree(rootId) {
  const rootRun = runtimeState.commandRuns.find((r) => r.id === rootId);
  if (!rootRun) return null;

  const children = runtimeState.commandRuns
    .filter((r) => r.parentRunId === rootId)
    .map((child) => buildRunTree(child.id))
    .filter(Boolean);

  return {
    id: rootRun.id,
    agentId: rootRun.agentId,
    agentName: rootRun.agentName,
    command: rootRun.command,
    status: rootRun.status,
    phase: rootRun.phase,
    startedAt: rootRun.startedAt,
    completedAt: rootRun.completedAt,
    durationMs: rootRun.durationMs,
    retryCount: rootRun.retryCount,
    model: rootRun.model,
    provider: rootRun.provider,
    tokenUsage: rootRun.tokenUsage,
    toolCalls: rootRun.toolCalls || [],
    artifacts: rootRun.artifacts || [],
    children,
  };
}

function buildToolSchemaDescription(agent) {
  const permissions = agent.permissions || {};
  const sandboxMode = agent.sandboxMode || "workspace-write";
  const enabledCategories = [];

  if (permissions.terminal) enabledCategories.push("shell");
  if (permissions.browser) enabledCategories.push("browser");
  if (permissions.files) enabledCategories.push("filesystem");
  if (permissions.git) enabledCategories.push("git");
  if (permissions.delegation) enabledCategories.push("delegation");

  const allowedTools = TOOL_DEFINITIONS.filter((tool) => {
    if (!enabledCategories.includes(tool.category) && tool.category !== "code" && tool.category !== "http" && tool.category !== "connector") return false;
    if (sandboxMode === "none" && ["filesystem.write", "shell.exec", "http.request"].includes(tool.name)) return false;
    if (sandboxMode === "read-only" && ["filesystem.write", "shell.exec", "http.request"].includes(tool.name)) return false;
    return true;
  });

  if (allowedTools.length === 0) {
    return "No tools are currently available. Respond with text only.";
  }

  const toolDescriptions = allowedTools.map((tool) => {
    const params = tool.parameters.map((p) => {
      const req = p.required ? "required" : "optional";
      const def = p.default !== undefined ? `, default: ${JSON.stringify(p.default)}` : "";
      return `    "${p.name}": (${p.type}, ${req}${def}) ${p.description || ""}`;
    }).join(",\n");

    return `  "${tool.name}": ${tool.description}\n  Parameters: {\n${params}\n  }`;
  }).join("\n\n");

  return [
    "You have access to the following tools. To use a tool, include a ```json code block in your response with the tool call.",
    "Format: ```json\n{\"tool\": \"<tool_name>\", \"parameters\": {<parameters>}}\n```",
    "You MUST wrap your reasoning in a <thought>...</thought> block BEFORE any tool call.",
    "If you have enough information to answer without tools, just respond normally without a ```json block.",
    "When you are done and have the final answer, respond with plain text and no tool call.\n",
    toolDescriptions,
  ].join("\n\n");
}

function parseToolCallFromLlmResponse(text) {
  if (!text) return null;

  const hasThought = /<thought>[\s\S]*?<\/thought>/i.test(text);
  const hasJsonBlock = /```json\s*/i.test(text);

  if (!hasJsonBlock) return null;

  if (!hasThought) {
    return { error: "You must provide a <thought> block explaining your reasoning before invoking a tool. Please rewrite your response." };
  }

  const startMatch = text.match(/```json\s*/i);
  if (!startMatch) return null;

  const startIndex = startMatch.index + startMatch[0].length;
  const endMatch = text.lastIndexOf("```");

  if (endMatch === -1 || endMatch <= startIndex) {
    return { error: "The JSON block must be closed with ```." };
  }

  const jsonSubstring = text.slice(startIndex, endMatch).trim();

  try {
    const parsed = JSON.parse(jsonSubstring);
    if (!parsed.tool || typeof parsed.tool !== "string") {
      return { error: "Tool call JSON must include a \"tool\" field with the tool name." };
    }
    return parsed;
  } catch {
    return { error: "JSON.parse failed on the extracted content. Fix the JSON formatting." };
  }
}

const activeAgentRuns = new Map();

async function runAgenticLoop(body, request, response) {
  const agent = body?.agent;
  const maxIterations = Math.min(Number(body?.maxIterations || 15), 30);
  const autoApproveSafe = Boolean(body?.autoApproveSafe);
  const timeoutMs = Number(body?.timeoutMs || 300000);

  if (!agent?.id || !agent?.name || !agent?.provider || !agent?.model) {
    throw new Error("Agent id, name, provider, and model are required.");
  }

  const runId = `arun_${randomUUID()}`;
  const workspace = resolve(agent.workspace || process.cwd());
  const startedAt = Date.now();

  const runRecord = {
    id: runId,
    agentId: agent.id,
    agentName: agent.name,
    command: "agentic-loop",
    cwd: workspace,
    status: "running",
    phase: "executing",
    activity: { kind: "delegation", label: "Agentic Loop", summary: "Autonomous think-act-observe loop" },
    startedAt: new Date().toISOString(),
    completedAt: null,
    durationMs: null,
    exitCode: null,
    timedOut: false,
    stdout: "",
    stderr: "",
    error: "",
    retryCount: 0,
    maxRetries: maxIterations,
    parentRunId: null,
    retryOfRunId: null,
    model: agent.model,
    provider: agent.provider,
    tokenUsage: null,
    toolCalls: [],
    artifacts: [],
  };

  upsertCommandRun(runRecord);
  activeAgentRuns.set(runId, { canceled: false });

  const toolSchema = buildToolSchemaDescription(agent);
  const enrichedSystemPrompt = [
    buildSystemPrompt(agent),
    "",
    "---",
    "",
    toolSchema,
  ].join("\n");

  let conversation = normalizeConversation(body.messages || []);

  if (conversationHasImages(conversation) && !modelSupportsVision(agent.provider, agent.model)) {
    conversation = stripImagesFromConversation(conversation);
  }

  const hasProfileData = (phase4UserProfile.techStack?.length ?? 0) > 0 || phase4UserProfile.workflowNotes?.trim().length > 0;
  if (hasProfileData) {
    const profileBlock = buildPhase4ProfileInjection(phase4UserProfile);
    const stripped = conversation.filter((m) => !(m.role === "system" && m.content?.startsWith("<!-- digital-twin-profile -->")));
    conversation = [{ role: "system", content: profileBlock }, ...stripped];
  }

  const isStreaming = response && !response.headersSent;
  if (isStreaming) {
    writeNdjsonHeaders(response);
  }

  function emit(event) {
    emitRuntimeEvent(event.type, runId, agent.id, agent.name, event);
    if (isStreaming) {
      writeNdjsonEvent(response, { ...event, runId });
    }
  }

  emit({ type: "agent_loop:started", phase: "executing", agentId: agent.id, agentName: agent.name, maxIterations });

  let finalText = "";
  let iteration = 0;
  let totalTokens = 0;
  let loopError = null;

  const deadline = Date.now() + timeoutMs;

  try {
    while (iteration < maxIterations) {
      iteration++;

      const canceledRun = activeAgentRuns.get(runId);
      if (canceledRun?.canceled) {
        loopError = "Agentic loop was canceled by user.";
        break;
      }

      if (Date.now() > deadline) {
        loopError = "Agentic loop timed out.";
        break;
      }

      emit({ type: "agent_loop:iteration", phase: "executing", iteration, maxIterations });

      const chatInput = {
        agent: { ...agent, systemPrompt: enrichedSystemPrompt },
        messages: conversation,
      };

      let chatResult;
      try {
        chatResult = await runChat(chatInput);
      } catch (chatErr) {
        loopError = `LLM call failed at iteration ${iteration}: ${chatErr.message}`;
        break;
      }

      if (!chatResult?.text) {
        loopError = `LLM returned empty response at iteration ${iteration}.`;
        break;
      }

      const llmText = chatResult.text;
      totalTokens += (chatResult.usage?.total_tokens || chatResult.usage?.totalTokens || 0);

      emit({
        type: "agent_loop:thinking",
        phase: "executing",
        iteration,
        text: llmText.slice(0, 2000),
        provider: chatResult.provider,
        usage: chatResult.usage,
      });

      const parsedToolCall = parseToolCallFromLlmResponse(llmText);

      if (parsedToolCall && parsedToolCall.error) {
        conversation.push({ role: "assistant", content: llmText });
        conversation.push({ role: "user", content: `Tool call formatting error: ${parsedToolCall.error}` });
        emit({ type: "agent_loop:tool_error", phase: "executing", iteration, error: parsedToolCall.error });
        continue;
      }

      if (!parsedToolCall) {
        finalText = llmText;
        conversation.push({ role: "assistant", content: llmText });
        emit({ type: "agent_loop:completed", phase: "completed", iteration, finalText: llmText.slice(0, 4000) });
        break;
      }

      const toolName = parsedToolCall.tool;
      const toolParams = parsedToolCall.parameters || {};

      const definition = TOOL_DEFINITIONS.find((t) => t.name === toolName);
      if (!definition) {
        conversation.push({ role: "assistant", content: llmText });
        conversation.push({ role: "user", content: `Unknown tool: "${toolName}". Available tools are defined in your system prompt. Try again.` });
        emit({ type: "agent_loop:tool_error", phase: "executing", iteration, error: `Unknown tool: ${toolName}` });
        continue;
      }

      const approvalCheck = checkToolApprovalNeeded(toolName, toolParams, agent, agent.sandboxMode);
      if (approvalCheck.blocked) {
        conversation.push({ role: "assistant", content: llmText });
        conversation.push({ role: "user", content: `Tool "${toolName}" is blocked: ${approvalCheck.reason}` });
        emit({ type: "agent_loop:tool_blocked", phase: "executing", iteration, tool: toolName, reason: approvalCheck.reason });
        continue;
      }

      if (approvalCheck.needed && !autoApproveSafe) {
        const approvalRequest = createToolApprovalRequest(
          toolName,
          agent.id,
          agent.name,
          toolParams,
          approvalCheck.reasons,
          approvalCheck.preview,
        );

        conversation.push({ role: "assistant", content: llmText });
        emit({
          type: "agent_loop:approval_required",
          phase: "waiting_for_approval",
          iteration,
          tool: toolName,
          approvalRequestId: approvalRequest.id,
          reasons: approvalCheck.reasons,
          preview: approvalCheck.preview,
        });

        const approvalResult = await waitForApproval(approvalRequest.id, deadline - Date.now());

        if (approvalResult.action === "reject") {
          conversation.push({ role: "user", content: `User rejected the tool call "${toolName}". Modify your approach and try again, or respond without using that tool.` });
          emit({ type: "agent_loop:approval_rejected", phase: "executing", iteration, tool: toolName });
          continue;
        }

        if (approvalResult.action === "edit" && approvalResult.editedParameters) {
          Object.assign(toolParams, approvalResult.editedParameters);
        }

        emit({ type: "agent_loop:approval_approved", phase: "executing", iteration, tool: toolName });
      }

      if (approvalCheck.needed && autoApproveSafe && definition.riskLevel === "safe") {
        emit({ type: "agent_loop:approval_auto_approved", phase: "executing", iteration, tool: toolName });
      }

      emit({ type: "agent_loop:tool_call", phase: "executing", iteration, tool: toolName, parameters: toolParams });

      let toolResult;
      try {
        toolResult = await executeToolInternal(toolName, toolParams, agent, workspace);
      } catch (toolErr) {
        toolResult = { ok: false, tool: toolName, error: toolErr.message };
      }

      const toolCallRecord = {
        tool: toolName,
        parameters: toolParams,
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: 0,
        result: toolResult.ok ? "success" : "failure",
      };

      runRecord.toolCalls = [...(runRecord.toolCalls || []), toolCallRecord];

      const resultSummary = toolResult.ok
        ? JSON.stringify(toolResult.data || {}, null, 2).slice(0, 6000)
        : `Error: ${toolResult.error || "Tool execution failed."}`;

      conversation.push({ role: "assistant", content: llmText });
      conversation.push({ role: "user", content: `[Tool Result: ${toolName}]\n${resultSummary}` });

      emit({
        type: "agent_loop:tool_result",
        phase: "executing",
        iteration,
        tool: toolName,
        ok: toolResult.ok,
        resultPreview: resultSummary.slice(0, 2000),
      });

      if (iteration >= maxIterations) {
        finalText = llmText.replace(/```json[\s\S]*?```/g, "").trim() || llmText;
        emit({ type: "agent_loop:max_iterations", phase: "completed", iteration, finalText: finalText.slice(0, 4000) });
      }
    }
  } catch (err) {
    loopError = err.message;
  }

  const finalStatus = loopError ? (activeAgentRuns.get(runId)?.canceled ? "canceled" : "failed") : "completed";

  updateCommandRun(runId, (currentRun) => ({
    ...currentRun,
    status: finalStatus,
    phase: finalStatus,
    completedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    exitCode: finalStatus === "completed" ? 0 : 1,
    error: loopError || "",
    tokenUsage: { totalTokens },
    toolCalls: runRecord.toolCalls || [],
  }));

  activeAgentRuns.delete(runId);

  const finalPayload = {
    ok: finalStatus === "completed",
    runId,
    agentId: agent.id,
    agentName: agent.name,
    status: finalStatus,
    iterations: iteration,
    maxIterations,
    finalText: finalText || loopError || "",
    toolCalls: runRecord.toolCalls || [],
    tokenUsage: { totalTokens },
    durationMs: Date.now() - startedAt,
    error: loopError || null,
  };

  emit({
    type: finalStatus === "completed" ? "agent_loop:completed" : "agent_loop:failed",
    phase: finalStatus,
    ...finalPayload,
  });

  if (isStreaming) {
    writeNdjsonEvent(response, { type: "completed", ...finalPayload });
    response.end();
  }

  return finalPayload;
}

function waitForApproval(approvalId, timeoutMs) {
  return new Promise((resolve) => {
    const deadline = Date.now() + Math.min(timeoutMs || 600000, 600000);
    const interval = setInterval(() => {
      const approval = toolApprovalRequests.get(approvalId);
      if (!approval) {
        clearInterval(interval);
        resolve({ action: "reject" });
        return;
      }

      if (approval._resolved) {
        clearInterval(interval);
        resolve(approval._resolution || { action: "reject" });
        return;
      }

      if (Date.now() > deadline) {
        clearInterval(interval);
        toolApprovalRequests.delete(approvalId);
        resolve({ action: "reject" });
      }
    }, 1000);
  });
}

const server = createServer(async (request, response) => {
  if (!request.url) {
    sendJson(response, 400, { error: "Missing request URL" });
    return;
  }

  if (request.method === "OPTIONS") {
    sendJson(response, 200, { ok: true });
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

  try {
    if (request.method === "GET" && (url.pathname === "/health" || url.pathname === "/v1/health")) {
      sendJson(response, 200, {
        ok: true,
        runtime: "control-room-local-runtime",
        providers: providerAvailability(),
        connectors: connectorAvailability(),
        connectorSessions: publicConnectorSessions(),
        auth: githubAuthStatus(),
        browserUse: browserUseStatus(),
        runs: {
          retained: runtimeState.commandRuns.length,
        },
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/connectors") {
      sendJson(response, 200, {
        ok: true,
        connectors: connectorAvailability(),
        sessions: publicConnectorSessions(),
        oauth: {
          google: connectorAuthStatus("google"),
          gmail: connectorAuthStatus("gmail"),
          googleDrive: connectorAuthStatus("googleDrive"),
          googleCalendar: connectorAuthStatus("googleCalendar"),
          slack: connectorAuthStatus("slack"),
          notion: connectorAuthStatus("notion"),
          github: connectorAuthStatus("github"),
          vercel: connectorAuthStatus("vercel"),
        },
        composio: {
          configured: Boolean(getComposioApiKey()),
          userId: composioUserId,
          baseUrl: composioBaseUrl,
          toolkits: composioConnectorToolkits,
        },
      });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/connectors\/[^/]+\/oauth\/start$/)) {
      const provider = decodeURIComponent(url.pathname.slice("/v1/connectors/".length, -"/oauth/start".length));
      if (isComposioConnector(provider) && getComposioApiKey()) {
        try {
          sendJson(response, 200, await startComposioConnector(provider));
        } catch (err) {
          sendJson(response, 500, {
            ok: false,
            provider,
            connectorProvider: "composio",
            error: err instanceof Error ? err.message : "Failed to start Composio connector.",
          });
        }
        return;
      }

      if (isComposioConnector(provider) && !getComposioApiKey()) {
        sendJson(response, 400, {
          ok: false,
          provider,
          connectorProvider: "composio",
          configured: false,
          error: "Add COMPOSIO_API_KEY in .env.runtime.local or save it in Connector Hub, then try again.",
        });
        return;
      }

      const config = getConnectorOAuthConfig(provider);
      if (!config) {
        sendJson(response, 400, { ok: false, error: `${provider} does not support OAuth start from this runtime yet.` });
        return;
      }
      if (!config.clientId || !config.clientSecret) {
        sendJson(response, 400, {
          ok: false,
          error: `Add ${provider.toUpperCase()}_CLIENT_ID and ${provider.toUpperCase()}_CLIENT_SECRET to .env.runtime.local, then restart the runtime.`,
          configured: false,
        });
        return;
      }

      const state = randomUUID();
      pendingConnectorOAuth.set(state, { provider, createdAt: Date.now() });
      const params = new URLSearchParams({
        client_id: config.clientId,
        redirect_uri: connectorRedirectUri(provider),
        state,
      });

      if (provider === "google") {
        params.set("response_type", "code");
        params.set("access_type", "offline");
        params.set("prompt", "consent");
        params.set("scope", config.scopes.join(" "));
      } else if (provider === "slack") {
        params.set("scope", config.scopes.join(","));
      } else if (provider === "notion") {
        params.set("response_type", "code");
        params.set("owner", "user");
      }

      sendJson(response, 200, {
        ok: true,
        provider,
        authUrl: `${config.authUrl}?${params.toString()}`,
        redirectUri: connectorRedirectUri(provider),
        scopes: config.scopes,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/connectors/composio/callback") {
      const provider = url.searchParams.get("provider") || "";
      const connectedAccountId =
        url.searchParams.get("connected_account_id") ||
        url.searchParams.get("connectedAccountId") ||
        url.searchParams.get("account_id") ||
        url.searchParams.get("id") ||
        runtimeState.connectorSessions?.[provider]?.composioConnectedAccountId ||
        "";

      response.setHeader("Content-Type", "text/html");
      if (!provider || !isComposioConnector(provider)) {
        response.statusCode = 400;
        response.end("<h1>Composio connector failed</h1><p>Missing connector provider.</p>");
        return;
      }

      try {
        if (connectedAccountId) {
          await refreshComposioConnector(provider, connectedAccountId);
        } else {
          runtimeState.connectorSessions[provider] = {
            ...(runtimeState.connectorSessions[provider] || {}),
            provider,
            authType: "composio",
            composioToolkit: composioConnectorToolkits[provider],
            accountLabel: `${composioConnectorToolkits[provider]} via Composio`,
            updatedAt: new Date().toISOString(),
          };
          saveConnectorSessions();
        }
        response.statusCode = 200;
        response.end(connectorSuccessHtml(`${provider} via Composio`));
      } catch (err) {
        response.statusCode = 500;
        response.end(`<h1>Composio connector failed</h1><p>${String(err.message || err)}</p>`);
      }
      return;
    }

    if (request.method === "GET" && url.pathname.match(/^\/v1\/connectors\/[^/]+\/callback$/)) {
      const provider = decodeURIComponent(url.pathname.slice("/v1/connectors/".length, -"/callback".length));
      const code = url.searchParams.get("code") || "";
      const state = url.searchParams.get("state") || "";
      const pending = pendingConnectorOAuth.get(state);
      if (!code || !pending || pending.provider !== provider) {
        response.statusCode = 400;
        response.setHeader("Content-Type", "text/html");
        response.end("<h1>Connector auth failed</h1><p>Missing or invalid OAuth state/code.</p>");
        return;
      }

      try {
        pendingConnectorOAuth.delete(state);
        await exchangeConnectorOAuthCode(provider, code);
        response.statusCode = 200;
        response.setHeader("Content-Type", "text/html");
        response.end(connectorSuccessHtml(provider));
      } catch (err) {
        response.statusCode = 500;
        response.setHeader("Content-Type", "text/html");
        response.end(`<h1>Connector auth failed</h1><p>${String(err.message || err)}</p>`);
      }
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/connectors\/[^/]+\/token$/)) {
      const provider = decodeURIComponent(url.pathname.slice("/v1/connectors/".length, -"/token".length));
      const body = await readJson(request);
      const token = `${body?.token || ""}`.trim();
      if (!token) {
        sendJson(response, 400, { ok: false, error: "token is required." });
        return;
      }

      runtimeState.connectorSessions[provider] = {
        provider,
        authType: "token",
        apiKey: token,
        keyPreview: maskSecretKey(token),
        scopes: Array.isArray(body?.scopes) ? body.scopes : [],
        accountLabel: body?.label || provider,
        updatedAt: new Date().toISOString(),
        expiresAt: body?.expiresAt || null,
      };
      saveConnectorSessions();
      sendJson(response, 200, { ok: true, session: publicConnectorSessions()[provider] });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/connectors\/[^/]+\/disconnect$/)) {
      const provider = decodeURIComponent(url.pathname.slice("/v1/connectors/".length, -"/disconnect".length));
      delete runtimeState.connectorSessions[provider];
      saveConnectorSessions();
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/connectors/gmail/latest") {
      try {
        const limit = Number(url.searchParams.get("limit") || 5);
        const query = url.searchParams.get("q") || "";
        sendJson(response, 200, await fetchLatestGmailMessages(limit, query));
      } catch (err) {
        sendJson(response, 500, {
          ok: false,
          error: err instanceof Error ? err.message : "Failed to read Gmail through Composio.",
        });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/files/view") {
      const requestedPath = (url.searchParams.get("path") || "").trim();
      if (!requestedPath) {
        sendJson(response, 400, { ok: false, error: "path parameter is required." });
        return;
      }

      const resolvedPath = resolve(requestedPath);
      if (!isAllowedArtifactPath(resolvedPath)) {
        sendJson(response, 403, { ok: false, error: "Requested file is outside the allowed workspace." });
        return;
      }

      try {
        const stats = statSync(resolvedPath);
        if (!stats.isFile()) {
          sendJson(response, 404, { ok: false, error: "Requested file is not a regular file." });
          return;
        }

        const buffer = readFileSync(resolvedPath);
        sendBinary(response, 200, getMimeTypeForPath(resolvedPath), buffer);
      } catch (error) {
        sendJson(response, 404, {
          ok: false,
          error: error instanceof Error ? error.message : "Requested file could not be opened.",
        });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/browser-use/health") {
      sendJson(response, 200, {
        ok: true,
        browserUse: browserUseStatus(),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/browser-use/sessions") {
      sendJson(response, 200, {
        ok: true,
        sessions: runtimeState.browserUseSessions,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/browser-use/sessions") {
      const body = await readJson(request);
      const session = await createBrowserUseSession({
        task: body?.task || "",
        agentId: body?.agentId || "",
        agentName: body?.agentName || "",
        model: body?.model || "",
        keepAlive: Boolean(body?.keepAlive),
        maxCostUsd: body?.maxCostUsd || "",
      });

      sendJson(response, 200, {
        ok: true,
        session,
      });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/v1/browser-use/sessions/")) {
      const sessionId = decodeURIComponent(url.pathname.slice("/v1/browser-use/sessions/".length));
      if (!sessionId || sessionId.includes("/")) {
        sendJson(response, 404, { ok: false, error: "Browser Use session not found." });
        return;
      }

      const session = await getBrowserUseSession(sessionId);
      sendJson(response, 200, {
        ok: true,
        session,
      });
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/v1/browser-use/sessions/") && url.pathname.endsWith("/stop")) {
      const sessionId = decodeURIComponent(
        url.pathname.slice("/v1/browser-use/sessions/".length, -"/stop".length),
      );

      if (!sessionId) {
        sendJson(response, 404, { ok: false, error: "Browser Use session not found." });
        return;
      }

      const session = await stopBrowserUseSession(sessionId);
      sendJson(response, 200, {
        ok: true,
        session,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/observability/usage") {
      const agentId = (url.searchParams.get("agentId") || "").trim();
      const period = url.searchParams.get("period") || "24h";

      const now = Date.now();
      const periodMs = period === "7d" ? 7 * 86400000 : period === "1h" ? 3600000 : 86400000;
      const cutoff = new Date(now - periodMs).toISOString();

      const relevantRuns = runtimeState.commandRuns.filter((run) => {
        if (agentId && run.agentId !== agentId) return false;
        if (run.startedAt && run.startedAt < cutoff) return false;
        return true;
      });

      const totalRuns = relevantRuns.length;
      const completedRuns = relevantRuns.filter((r) => r.status === "completed").length;
      const failedRuns = relevantRuns.filter((r) => r.status === "failed").length;
      const canceledRuns = relevantRuns.filter((r) => r.status === "canceled").length;
      const totalDurationMs = relevantRuns.reduce((sum, r) => sum + (r.durationMs || 0), 0);
      const totalToolCalls = relevantRuns.reduce((sum, r) => sum + (r.toolCalls?.length || 0), 0);
      const totalArtifacts = relevantRuns.reduce((sum, r) => sum + (r.artifacts?.length || 0), 0);
      const totalTokenUsage = relevantRuns.reduce((sum, r) => {
        const tu = r.tokenUsage || {};
        return sum + (tu.totalTokens || 0);
      }, 0);

      const costPer1kTokens = { openai: 0.002, anthropic: 0.003, gemini: 0.0005, groq: 0.0001, openrouter: 0.001 };
      const estimatedCost = relevantRuns.reduce((sum, r) => {
        const tu = r.tokenUsage || {};
        const provider = (r.provider || "").toLowerCase();
        const rate = costPer1kTokens[provider] || 0.002;
        return sum + ((tu.totalTokens || 0) / 1000) * rate;
      }, 0);

      const byAgent = {};
      for (const run of relevantRuns) {
        const key = run.agentId;
        if (!byAgent[key]) {
          byAgent[key] = { runs: 0, completed: 0, failed: 0, durationMs: 0, tokens: 0 };
        }
        byAgent[key].runs++;
        if (run.status === "completed") byAgent[key].completed++;
        if (run.status === "failed") byAgent[key].failed++;
        byAgent[key].durationMs += run.durationMs || 0;
        byAgent[key].tokens += (run.tokenUsage?.totalTokens || 0);
      }

      sendJson(response, 200, {
        ok: true,
        period,
        totalRuns,
        completedRuns,
        failedRuns,
        canceledRuns,
        totalDurationMs,
        totalToolCalls,
        totalArtifacts,
        totalTokenUsage,
        estimatedCost: Math.round(estimatedCost * 10000) / 10000,
        byAgent,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/observability/costs") {
      const agentId = (url.searchParams.get("agentId") || "").trim();

      const runs = runtimeState.commandRuns.filter((run) => {
        if (agentId && run.agentId !== agentId) return false;
        return run.tokenUsage && run.tokenUsage.totalTokens > 0;
      });

      const costs = runs.map((run) => {
        const tu = run.tokenUsage || {};
        const provider = (run.provider || "").toLowerCase();
        const rates = { openai: { prompt: 0.003, completion: 0.006 }, anthropic: { prompt: 0.003, completion: 0.015 }, gemini: { prompt: 0.0005, completion: 0.0015 }, groq: { prompt: 0.00005, completion: 0.0001 }, openrouter: { prompt: 0.001, completion: 0.002 } };
        const rate = rates[provider] || rates.openai;
        const promptCost = ((tu.promptTokens || 0) / 1000) * rate.prompt;
        const completionCost = ((tu.completionTokens || 0) / 1000) * rate.completion;

        return {
          runId: run.id,
          agentId: run.agentId,
          provider: run.provider,
          model: run.model,
          promptTokens: tu.promptTokens || 0,
          completionTokens: tu.completionTokens || 0,
          totalTokens: tu.totalTokens || 0,
          promptCost: Math.round(promptCost * 100000) / 100000,
          completionCost: Math.round(completionCost * 100000) / 100000,
          totalCost: Math.round((promptCost + completionCost) * 100000) / 100000,
          durationMs: run.durationMs,
          startedAt: run.startedAt,
        };
      });

      const totalCost = costs.reduce((sum, c) => sum + c.totalCost, 0);
      const totalTokens = costs.reduce((sum, c) => sum + c.totalTokens, 0);

      sendJson(response, 200, {
        ok: true,
        costs,
        totalCost: Math.round(totalCost * 100000) / 100000,
        totalTokens,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/runs") {
      const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 20)));
      const agentId = (url.searchParams.get("agentId") || "").trim();
      const runs = runtimeState.commandRuns
        .filter((run) => !agentId || run.agentId === agentId)
        .slice(0, limit)
        .map(serializeCommandRun);
      sendJson(response, 200, {
        ok: true,
        runs,
      });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/v1/runs/")) {
      const runId = decodeURIComponent(url.pathname.slice("/v1/runs/".length));
      const run = runtimeState.commandRuns.find((entry) => entry.id === runId);

      if (!run) {
        sendJson(response, 404, {
          error: "Run not found",
        });
        return;
      }

      sendJson(response, 200, {
        ok: true,
        run: serializeCommandRun(run),
      });
      return;
    }

    if (request.method === "POST" && url.pathname.startsWith("/v1/runs/") && url.pathname.endsWith("/cancel")) {
      const runId = decodeURIComponent(url.pathname.slice("/v1/runs/".length, -"/cancel".length));
      const result = cancelCommandRun(runId);
      sendJson(response, result.statusCode || 200, result);
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        ...corsHeaders({
          "Access-Control-Allow-Methods": "GET,OPTIONS",
        }),
        "X-Accel-Buffering": "no",
      });

      response.write(`data: ${JSON.stringify({ type: "connected", timestamp: new Date().toISOString() })}\n\n`);

      eventSubscribers.add(response);

      request.on("close", () => {
        eventSubscribers.delete(response);
      });

      return;
    }

    if (request.method === "GET" && url.pathname.match(/^\/v1\/runs\/[^/]+\/timeline$/)) {
      const runId = decodeURIComponent(url.pathname.slice("/v1/runs/".length, -"/timeline".length));
      const timeline = runTimelines.get(runId) || [];

      sendJson(response, 200, {
        ok: true,
        events: timeline,
      });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/runs\/[^/]+\/retry$/)) {
      const runId = decodeURIComponent(url.pathname.slice("/v1/runs/".length, -"/retry".length));
      const result = retryCommandRun(runId);
      sendJson(response, result.statusCode || 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/runs\/[^/]+\/resume$/)) {
      const runId = decodeURIComponent(url.pathname.slice("/v1/runs/".length, -"/resume".length));
      const result = resumeCommandRun(runId);
      sendJson(response, result.statusCode || 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/agent/run") {
      const body = await readJson(request);
      try {
        const result = await runAgenticLoop(body, null, null);
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 500, {
          ok: false,
          error: error instanceof Error ? error.message : "Agentic loop failed.",
        });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/agent/run/stream") {
      const body = await readJson(request);
      try {
        await runAgenticLoop(body, request, response);
      } catch (error) {
        if (!response.headersSent) {
          sendJson(response, 500, {
            ok: false,
            error: error instanceof Error ? error.message : "Agentic loop stream failed.",
          });
        } else {
          writeNdjsonEvent(response, {
            type: "error",
            error: error instanceof Error ? error.message : "Agentic loop stream failed.",
          });
          response.end();
        }
      }
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/agent\/runs\/[^/]+\/cancel$/)) {
      const runId = decodeURIComponent(url.pathname.slice("/v1/agent/runs/".length, -"/cancel".length));
      const activeRun = activeAgentRuns.get(runId);
      if (!activeRun) {
        sendJson(response, 404, { ok: false, error: "Agent run not found or already completed." });
        return;
      }
      activeRun.canceled = true;
      sendJson(response, 200, { ok: true, runId, status: "canceled" });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/tools\/approvals\/[^/]+$/) && url.searchParams.has("agentLoop")) {
      const approvalId = decodeURIComponent(url.pathname.slice("/v1/tools/approvals/".length));
      const body = await readJson(request);
      const action = body.action || "approve";

      const approval = toolApprovalRequests.get(approvalId);
      if (!approval) {
        sendJson(response, 404, { ok: false, error: "Approval request not found or expired." });
        return;
      }

      if (new Date(approval.expiresAt) < new Date()) {
        toolApprovalRequests.delete(approvalId);
        sendJson(response, 400, { ok: false, error: "Approval request has expired." });
        return;
      }

      if (action === "reject") {
        approval._resolved = true;
        approval._resolution = { action: "reject" };
        toolApprovalRequests.delete(approvalId);
        sendJson(response, 200, { ok: true, action: "rejected" });
        return;
      }

      approval._resolved = true;
      approval._resolution = {
        action,
        editedParameters: action === "edit" ? body.editedParameters : null,
      };
      toolApprovalRequests.delete(approvalId);

      sendJson(response, 200, { ok: true, action: "approved" });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/chat") {
      const body = await readJson(request);
      const result = await runChat(body);
      sendJson(response, 200, {
        ok: true,
        ...result,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/execute") {
      const body = await readJson(request);

      // Module 11 — Inner Monologue gate: optional strict mode
      // If the caller sets requireThought: true, reject commands that have
      // no preceding <thought> evidence in the last assistant message.
      if (body.requireThought === true) {
        const lastAssistantContent = (body.recentAssistantContent || "");
        const hasThought = /<thought>[\s\S]*?<\/thought>/i.test(lastAssistantContent);
        if (!hasThought) {
          sendJson(response, 400, {
            ok: false,
            error: "Command rejected: no <thought> block found in the preceding agent turn. The agent must reason before acting.",
            thoughtGate: true,
          });
          return;
        }
      }

      const result = await runCommand(body);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/execute/stream") {
      const body = await readJson(request);
      await runCommandStream(request, response, body);
      return;
    }

    if (request.method === "GET" && url.pathname.match(/^\/v1\/memory\/[^/]+\/thread$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/memory/".length, -"/thread".length));
      const thread = getOrCreateThread(agentId);
      sendJson(response, 200, { ok: true, thread });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/memory\/[^/]+\/thread$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/memory/".length, -"/thread".length));
      const body = await readJson(request);
      const thread = getOrCreateThread(agentId);

      const message = {
        id: `msg_${randomUUID()}`,
        role: body.role || "user",
        content: body.content || "",
        sender: body.sender || body.role || "user",
        timestamp: new Date().toISOString(),
        tokens: estimateTokens(body.content || ""),
        metadata: body.metadata || {},
      };

      thread.messages.push(message);
      thread.totalTokens = thread.messages.reduce((sum, msg) => sum + (msg.tokens || 0), 0);
      thread.updatedAt = new Date().toISOString();

      autoSummarizeIfNeeded(agentId);

      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/memory\/[^/]+\/thread\/summarize$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/memory/".length, -"/thread/summarize".length));
      const thread = getOrCreateThread(agentId);

      if (thread.messages.length === 0) {
        sendJson(response, 200, { ok: true, summary: "No messages to summarize." });
        return;
      }

      const summaryParts = thread.messages.map((msg) => {
        const prefix = msg.role === "user" ? "User" : msg.role === "assistant" ? "Assistant" : "System";
        return `[${prefix}]: ${msg.content.slice(0, 200)}`;
      });

      thread.summary = `Conversation summary (${thread.messages.length} messages):\n${summaryParts.join("\n")}`;
      thread.summaryGeneratedAt = new Date().toISOString();
      thread.updatedAt = new Date().toISOString();

      sendJson(response, 200, { ok: true, summary: thread.summary });
      return;
    }

    if (request.method === "GET" && url.pathname.match(/^\/v1\/memory\/[^/]+\/notes$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/memory/".length, -"/notes".length));
      const query = url.searchParams.get("q") || "";
      let notes = agentNotesStore.get(agentId) || [];
      if (query.trim()) {
        notes = tfidfRank(query, notes, ["title", "content", "tags"]);
      }
      sendJson(response, 200, { ok: true, notes });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/memory\/[^/]+\/notes$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/memory/".length, -"/notes".length));
      const body = await readJson(request);

      if (!agentNotesStore.has(agentId)) {
        agentNotesStore.set(agentId, []);
      }

      const note = {
        id: `note_${randomUUID()}`,
        agentId,
        title: body.title || "Untitled Note",
        content: body.content || "",
        tags: body.tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      agentNotesStore.get(agentId).push(note);
      sendJson(response, 200, { ok: true, note });
      return;
    }

    if (request.method === "DELETE" && url.pathname.match(/^\/v1\/memory\/[^/]+\/notes\/[^/]+$/)) {
      const parts = url.pathname.slice("/v1/memory/".length).split("/");
      const agentId = decodeURIComponent(parts[0]);
      const noteId = decodeURIComponent(parts[2]);

      const notes = agentNotesStore.get(agentId) || [];
      agentNotesStore.set(agentId, notes.filter((n) => n.id !== noteId));
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname.match(/^\/v1\/memory\/[^/]+\/knowledge$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/memory/".length, -"/knowledge".length));
      const query = url.searchParams.get("q") || "";
      let entries = agentKnowledgeStore.get(agentId) || [];
      if (query.trim()) {
        entries = tfidfRank(query, entries, ["title", "content", "tags"]);
      }
      sendJson(response, 200, { ok: true, entries });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/memory\/[^/]+\/knowledge$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/memory/".length, -"/knowledge".length));
      const body = await readJson(request);

      if (!agentKnowledgeStore.has(agentId)) {
        agentKnowledgeStore.set(agentId, []);
      }

      const entry = {
        id: `know_${randomUUID()}`,
        agentId,
        title: body.title || "Untitled",
        content: body.content || "",
        source: body.source || "manual",
        tags: body.tags || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      agentKnowledgeStore.get(agentId).push(entry);
      sendJson(response, 200, { ok: true, entry });
      return;
    }

    if (request.method === "GET" && url.pathname.match(/^\/v1\/memory\/[^/]+\/files$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/memory/".length, -"/files".length));
      const files = agentFileAttachments.get(agentId) || [];
      sendJson(response, 200, { ok: true, files });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/memory\/[^/]+\/files$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/memory/".length, -"/files".length));
      const body = await readJson(request);

      if (!agentFileAttachments.has(agentId)) {
        agentFileAttachments.set(agentId, []);
      }

      const fileAttachment = {
        id: `file_${randomUUID()}`,
        agentId,
        name: body.name || "unknown",
        path: body.path || "",
        mimeType: body.mimeType || "application/octet-stream",
        size: body.size || 0,
        summary: body.summary || "",
        attachedAt: new Date().toISOString(),
      };

      agentFileAttachments.get(agentId).push(fileAttachment);
       sendJson(response, 200, { ok: true, file: fileAttachment });
       return;
    }

    if (request.method === "GET" && url.pathname === "/v1/automations") {
      const automations = Array.from(automationsStore.values());
      automations.forEach((automation) => scheduleAutomation(automation));
      sendJson(response, 200, { ok: true, automations });
      return;
    }

    function clearScheduledAutomation(automationId) {
      const timer = scheduledTimers.get(automationId);
      if (timer) {
        clearTimeout(timer);
        clearInterval(timer);
        scheduledTimers.delete(automationId);
      }
    }

    function getNextScheduleDelay(trigger = {}) {
      const config = trigger.config || {};
      const now = new Date();

      if (config.runAt) {
        return Math.max(1000, new Date(config.runAt).getTime() - now.getTime());
      }

      const cron = `${config.cron || ""}`.trim();
      const hourlyMatch = cron.match(/^(\d{1,2}) \* \* \* \*$/);
      if (hourlyMatch) {
        const minute = Math.max(0, Math.min(59, Number(hourlyMatch[1]) || 0));
        const next = new Date(now);
        next.setSeconds(0, 0);
        next.setMinutes(minute);
        if (next <= now) {
          next.setHours(next.getHours() + 1);
        }
        return next.getTime() - now.getTime();
      }

      const dailyMatch = cron.match(/^(\d{1,2}) (\d{1,2}) \* \* \*$/);
      if (dailyMatch) {
        const minute = Math.max(0, Math.min(59, Number(dailyMatch[1]) || 0));
        const hour = Math.max(0, Math.min(23, Number(dailyMatch[2]) || 0));
        const next = new Date(now);
        next.setHours(hour, minute, 0, 0);
        if (next <= now) {
          next.setDate(next.getDate() + 1);
        }
        return next.getTime() - now.getTime();
      }

      return parseCronToMs(cron);
    }

    function scheduleAutomation(automation) {
      clearScheduledAutomation(automation.id);
      if (automation.status !== "active" || automation.trigger?.type !== "schedule") {
        return;
      }

      const delay = getNextScheduleDelay(automation.trigger);
      if (!Number.isFinite(delay) || delay <= 0) {
        return;
      }

      const timer = setTimeout(async () => {
        await executeAutomation(automation.id);
        const latestAutomation = automationsStore.get(automation.id);
        if (!latestAutomation) return;
        if (latestAutomation.trigger?.config?.repeat === "once" || latestAutomation.trigger?.config?.runAt) {
          latestAutomation.status = "paused";
          latestAutomation.updatedAt = new Date().toISOString();
          saveAutomationState();
          scheduledTimers.delete(automation.id);
          return;
        }
        scheduleAutomation(latestAutomation);
      }, delay);
      scheduledTimers.set(automation.id, timer);
    }

    if (request.method === "POST" && url.pathname === "/v1/automations") {
      const body = await readJson(request);
      const { name, agentId, trigger, action } = body;

      if (!name || !agentId || !trigger || !action) {
        sendJson(response, 400, { ok: false, error: "name, agentId, trigger, and action are required." });
        return;
      }

      const automation = {
        id: `auto_${randomUUID()}`,
        name,
        agentId,
        agentName: body.agentName || action?.payload?.agent?.name || agentId,
        trigger,
        action,
        status: "active",
        lastRunAt: null,
        lastRunId: null,
        lastRunStatus: null,
        runCount: 0,
        errorCount: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      automationsStore.set(automation.id, automation);

      scheduleAutomation(automation);
      saveAutomationState();

      emitRuntimeEvent("automation:created", automation.id, agentId, agentId, { name, triggerType: trigger.type });
      sendJson(response, 200, { ok: true, automation });
      return;
    }

    if (request.method === "PATCH" && url.pathname.match(/^\/v1\/automations\/[^/]+$/)) {
      const automationId = decodeURIComponent(url.pathname.slice("/v1/automations/".length));
      const body = await readJson(request);
      const automation = automationsStore.get(automationId);

      if (!automation) {
        sendJson(response, 404, { ok: false, error: "Automation not found." });
        return;
      }

      if (body.name) automation.name = body.name;
      if (body.trigger) automation.trigger = body.trigger;
      if (body.action) automation.action = body.action;
      if (body.status && ["active", "paused", "disabled"].includes(body.status)) {
        automation.status = body.status;
      }
      automation.updatedAt = new Date().toISOString();

      if (body.status === "paused" || body.status === "disabled") {
        clearScheduledAutomation(automationId);
      } else if (automation.status === "active") {
        scheduleAutomation(automation);
      }
      saveAutomationState();

      sendJson(response, 200, { ok: true, automation });
      return;
    }

    if (request.method === "DELETE" && url.pathname.match(/^\/v1\/automations\/[^/]+$/)) {
      const automationId = decodeURIComponent(url.pathname.slice("/v1/automations/".length));
      clearScheduledAutomation(automationId);
      automationsStore.delete(automationId);
      automationRunsStore.delete(automationId);
      saveAutomationState();
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/automations\/[^/]+\/trigger$/)) {
      const automationId = decodeURIComponent(url.pathname.slice("/v1/automations/".length, -"/trigger".length));
      const result = await executeAutomation(automationId, { allowPaused: true });
      sendJson(response, result.ok ? 200 : 400, result);
      return;
    }

    if (request.method === "GET" && url.pathname.match(/^\/v1\/automations\/[^/]+\/runs$/)) {
      const automationId = decodeURIComponent(url.pathname.slice("/v1/automations/".length, -"/runs".length));
      const runs = (automationRunsStore.get(automationId) || []).slice(-20);
      sendJson(response, 200, { ok: true, runs });
      return;
    }

    async function executeAutomation(automationId, options = {}) {
      const automation = automationsStore.get(automationId);
      if (!automation) return { ok: false, error: "Automation not found." };
      if (automation.status === "disabled") {
        return { ok: false, error: "Automation is disabled." };
      }
      if (automation.status !== "active" && !options.allowPaused) {
        return { ok: false, error: "Automation is paused." };
      }

      const run = {
        id: `arun_${randomUUID()}`,
        automationId,
        agentId: automation.agentId,
        triggerType: automation.trigger.type,
        triggeredAt: new Date().toISOString(),
        completedAt: null,
        status: "running",
        runId: null,
        error: null,
        durationMs: null,
      };

      if (!automationRunsStore.has(automationId)) {
        automationRunsStore.set(automationId, []);
      }
      automationRunsStore.get(automationId).push(run);
      automation.lastRunAt = run.triggeredAt;
      automation.runCount++;

      emitRuntimeEvent("automation:triggered", automationId, automation.agentId, automation.agentName, {
        triggerType: automation.trigger.type,
        runId: run.id,
      });

      try {
        if (automation.action.type === "command") {
          const agent = automation.action.payload.agent || {
            id: automation.agentId,
            name: automation.agentName,
          };
          const command = automation.action.payload.command || "echo 'Hello from automation'";
          const cwd = automation.action.payload.cwd || agent.workspace || process.cwd();
          const execResult = await runCommand({ agent, command, cwd });
          run.runId = execResult.runId;
          run.status = execResult.ok ? "completed" : "failed";
          run.error = execResult.error || null;
        } else if (automation.action.type === "chat") {
          const agent = automation.action.payload.agent || {
            id: automation.agentId,
            name: automation.agentName,
          };
          const chatResult = await runChat({ agent, messages: [{ role: "user", content: automation.action.payload.message || "Execute scheduled task." }] });
          run.status = chatResult.ok ? "completed" : "failed";
          run.error = chatResult.error || null;
        } else {
          run.status = "completed";
        }
      } catch (err) {
        run.status = "failed";
        run.error = err.message;
        automation.errorCount++;
      }

      run.completedAt = new Date().toISOString();
      run.durationMs = Date.now() - new Date(run.triggeredAt).getTime();
      automation.lastRunStatus = run.status;
      automation.updatedAt = new Date().toISOString();
      saveAutomationState();

      emitRuntimeEvent("automation:completed", automationId, automation.agentId, automation.agentName, {
        runId: run.id,
        status: run.status,
        durationMs: run.durationMs,
      });

      return { ok: true, run };
    }

    function parseCronToMs(cron) {
      const simpleIntervals = {
        "* * * * *": 60000,
        "*/5 * * * *": 300000,
        "*/15 * * * *": 900000,
        "*/30 * * * *": 1800000,
        "0 * * * *": 3600000,
        "0 */6 * * *": 21600000,
        "0 0 * * *": 86400000,
      };
      return simpleIntervals[cron] || 3600000;
    }

    if (request.method === "GET" && url.pathname === "/v1/secrets") {
      const secrets = Array.from(secretsStore.values()).map((s) => ({
        id: s.id,
        provider: s.provider,
        label: s.label,
        keyPreview: s.keyPreview,
        status: s.status,
        lastValidatedAt: s.lastValidatedAt,
        expiresAt: s.expiresAt,
        scopes: s.scopes,
        isOAuth: s.isOAuth,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
      }));
      sendJson(response, 200, { ok: true, secrets });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/secrets") {
      const body = await readJson(request);
      const { provider, label, apiKey, scopes, expiresAt } = body;

      if (!provider || !apiKey) {
        sendJson(response, 400, { ok: false, error: "provider and apiKey are required." });
        return;
      }

      const secretId = `secret_${randomUUID()}`;
      const now = new Date().toISOString();

      const secret = {
        id: secretId,
        provider,
        label: label || provider,
        apiKey,
        keyPreview: maskSecretKey(apiKey),
        status: "active",
        lastValidatedAt: null,
        expiresAt: expiresAt || null,
        scopes: scopes || [],
        isOAuth: false,
        createdAt: now,
        updatedAt: now,
      };

      secretsStore.set(secretId, secret);

      sendJson(response, 200, {
        ok: true,
        secret: {
          id: secret.id,
          provider: secret.provider,
          label: secret.label,
          keyPreview: secret.keyPreview,
          status: secret.status,
          lastValidatedAt: secret.lastValidatedAt,
          expiresAt: secret.expiresAt,
          scopes: secret.scopes,
          isOAuth: secret.isOAuth,
          createdAt: secret.createdAt,
          updatedAt: secret.updatedAt,
        },
      });
      return;
    }

    if (request.method === "DELETE" && url.pathname.match(/^\/v1\/secrets\/[^/]+$/)) {
      const secretId = decodeURIComponent(url.pathname.slice("/v1/secrets/".length));
      if (!secretsStore.has(secretId)) {
        sendJson(response, 404, { ok: false, error: "Secret not found." });
        return;
      }
      secretsStore.delete(secretId);
      for (const [key, binding] of agentSecretBindings.entries()) {
        if (binding.secretId === secretId) {
          agentSecretBindings.delete(key);
        }
      }
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/secrets\/[^/]+\/validate$/)) {
      const secretId = decodeURIComponent(url.pathname.slice("/v1/secrets/".length, -"/validate".length));
      const secret = secretsStore.get(secretId);

      if (!secret) {
        sendJson(response, 404, { ok: false, status: "invalid", error: "Secret not found." });
        return;
      }

      const healthCheck = await validateProviderKey(secret.provider, secret.apiKey);
      secret.status = healthCheck.ok ? "active" : "invalid";
      secret.lastValidatedAt = healthCheck.checkedAt;

      sendJson(response, 200, {
        ok: healthCheck.ok,
        status: secret.status,
        healthCheck: {
          provider: secret.provider,
          ok: healthCheck.ok,
          latencyMs: healthCheck.latencyMs,
          model: healthCheck.model,
          error: healthCheck.error,
          checkedAt: healthCheck.checkedAt,
        },
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/secrets/health") {
      const checks = [];
      const envProviders = [
        { provider: "openai", key: process.env.OPENAI_API_KEY },
        { provider: "anthropic", key: process.env.ANTHROPIC_API_KEY },
        { provider: "gemini", key: process.env.GEMINI_API_KEY },
        { provider: "groq", key: process.env.GROQ_API_KEY },
        { provider: "nvidia", key: process.env.NVIDIA_API_KEY },
        { provider: "openrouter", key: process.env.OPENROUTER_API_KEY },
      ];

      for (const { provider, key } of envProviders) {
        if (key) {
          const check = await validateProviderKey(provider, key);
          checks.push({ provider, ...check });
        } else {
          checks.push({
            provider,
            ok: false,
            latencyMs: null,
            model: null,
            error: "No API key configured.",
            checkedAt: new Date().toISOString(),
          });
        }
      }

      sendJson(response, 200, { ok: true, checks });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/secrets/bindings") {
      const agentId = (url.searchParams.get("agentId") || "").trim();
      const bindings = Array.from(agentSecretBindings.values())
        .filter((b) => !agentId || b.agentId === agentId);
      sendJson(response, 200, { ok: true, bindings });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/secrets/bindings") {
      const body = await readJson(request);
      const { agentId, provider, secretId, model, isDefault } = body;

      if (!agentId || !provider || !secretId) {
        sendJson(response, 400, { ok: false, error: "agentId, provider, and secretId are required." });
        return;
      }

      const bindingKey = `${agentId}:${provider}`;
      agentSecretBindings.set(bindingKey, {
        agentId,
        provider,
        secretId,
        model: model || "",
        isDefault: isDefault ?? false,
      });

      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname.match(/^\/v1\/secrets\/variables\/[^/]+$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/secrets/variables/".length));
      const vars = agentVariables.get(agentId) || [];
      const safeVars = vars.map((v) => ({
        key: v.key,
        value: v.isSecret ? "****" : v.value,
        isSecret: v.isSecret,
        description: v.description,
        updatedAt: v.updatedAt,
      }));
      sendJson(response, 200, { ok: true, variables: safeVars });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/secrets\/variables\/[^/]+$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/secrets/variables/".length));
      const body = await readJson(request);
      const { key, value, isSecret, description } = body;

      if (!key || value === undefined) {
        sendJson(response, 400, { ok: false, error: "key and value are required." });
        return;
      }

      if (!agentVariables.has(agentId)) {
        agentVariables.set(agentId, []);
      }

      const vars = agentVariables.get(agentId);
      const existingIdx = vars.findIndex((v) => v.key === key);
      const newVar = {
        key,
        value,
        isSecret: isSecret ?? false,
        description: description || "",
        updatedAt: new Date().toISOString(),
      };

      if (existingIdx >= 0) {
        vars[existingIdx] = newVar;
      } else {
        vars.push(newVar);
      }

      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "DELETE" && url.pathname.match(/^\/v1\/secrets\/variables\/[^/]+\/[^/]+$/)) {
      const parts = url.pathname.slice("/v1/secrets/variables/".length).split("/");
      const agentId = decodeURIComponent(parts[0]);
      const key = decodeURIComponent(parts[1]);

      const vars = agentVariables.get(agentId) || [];
      agentVariables.set(agentId, vars.filter((v) => v.key !== key));

      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/tools") {
      sendJson(response, 200, {
        ok: true,
        tools: TOOL_DEFINITIONS,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/tools/approvals") {
      const agentId = (url.searchParams.get("agentId") || "").trim();
      const approvals = Array.from(toolApprovalRequests.values())
        .filter((a) => !agentId || a.agentId === agentId)
        .filter((a) => new Date(a.expiresAt) > new Date());

      sendJson(response, 200, {
        ok: true,
        approvals,
      });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/tools\/[^/]+\/invoke\/stream$/)) {
      const toolName = decodeURIComponent(url.pathname.slice("/v1/tools/".length, -"/invoke/stream".length));
      const body = await readJson(request);
      body.tool = toolName;
      await handleToolInvocationStream(request, response, body);
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/tools\/[^/]+\/invoke$/)) {
      const toolName = decodeURIComponent(url.pathname.slice("/v1/tools/".length, -"/invoke".length));
      const body = await readJson(request);
      body.tool = toolName;

      try {
        const result = await handleToolInvocation(body);
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 500, {
          ok: false,
          tool: toolName,
          error: error.message || "Tool invocation failed.",
        });
      }
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/tools\/approvals\/[^/]+$/)) {
      const approvalId = decodeURIComponent(url.pathname.slice("/v1/tools/approvals/".length));
      const body = await readJson(request);
      const action = body.action || "approve";

      const resolution = resolveToolApproval(approvalId, action, body.editedParameters);

      if (!resolution.ok) {
        sendJson(response, 400, resolution);
        return;
      }

      if (action === "reject") {
        sendJson(response, 200, resolution);
        return;
      }

      const toolBody = {
        tool: resolution.tool,
        agentId: resolution.agentId,
        parameters: resolution.parameters,
        approvalToken: resolution.approvalToken,
      };

      try {
        const result = await handleToolInvocation(toolBody);
        sendJson(response, 200, result);
      } catch (error) {
        sendJson(response, 500, {
          ok: false,
          tool: resolution.tool,
          error: error.message || "Tool invocation after approval failed.",
        });
      }
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/delegations/tree" && url.searchParams.has("rootId")) {
      const rootId = url.searchParams.get("rootId");
      const runTree = buildRunTree(rootId);
      sendJson(response, 200, { ok: true, tree: runTree });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/delegations/create") {
      const body = await readJson(request);
      const { fromAgentId, assigneeId, title, payload, executionMode, priority, inputContract, outputContract, parentDelegationId, dependencyIds } = body;

      if (!assigneeId || !title) {
        sendJson(response, 400, { ok: false, error: "assigneeId and title are required." });
        return;
      }

      const delegation = {
        id: `del_${randomUUID()}`,
        fromAgentId: fromAgentId || "human",
        assigneeId,
        title,
        payload: payload || "",
        executionMode: executionMode || "thread",
        priority: priority || "medium",
        status: "queued",
        inputContract: inputContract || {},
        outputContract: outputContract || {},
        parentDelegationId: parentDelegationId || null,
        dependencyIds: dependencyIds || [],
        cwd: body.cwd || process.cwd(),
        notes: body.notes || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      emitRuntimeEvent("delegation:created", delegation.id, fromAgentId || "human", fromAgentId || "Human", {
        assigneeId,
        title,
        priority: delegation.priority,
      });

      sendJson(response, 200, { ok: true, delegation });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/delegations\/[^/]+\/cancel$/)) {
      const delegationId = decodeURIComponent(url.pathname.slice("/v1/delegations/".length, -"/cancel".length));
      const body = await readJson(request) || {};

      emitRuntimeEvent("delegation:canceled", delegationId, "system", "System", {
        reason: body.reason || "Canceled by user.",
      });

      sendJson(response, 200, {
        ok: true,
        delegation: {
          id: delegationId,
          status: "canceled",
          cancellationReason: body.reason || "Canceled by user.",
          canceledAt: new Date().toISOString(),
        },
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/workspace/devices") {
      const devices = Array.from(workspaceDevices.values(), serializeWorkspaceDevice);
      sendJson(response, 200, { ok: true, devices });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/workspace/device") {
      const workspacePath = (url.searchParams.get("path") || "").trim();
      if (!workspacePath) {
        sendJson(response, 400, { ok: false, error: "path parameter is required." });
        return;
      }

      const device = getOrCreateWorkspaceDevice(workspacePath);
      await refreshWorkspaceDeviceInfo(device);
      sendJson(response, 200, { ok: true, device: serializeWorkspaceDevice(device) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/workspace/device/refresh") {
      const body = await readJson(request);
      const workspacePath = body?.path || body?.workspacePath || "";
      if (!workspacePath) {
        sendJson(response, 400, { ok: false, error: "path is required." });
        return;
      }

      const device = getOrCreateWorkspaceDevice(workspacePath);
      await refreshWorkspaceDeviceInfo(device);
      sendJson(response, 200, { ok: true, device: serializeWorkspaceDevice(device) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/workspace/device/start") {
      const body = await readJson(request);
      const workspacePath = body?.path || body?.workspacePath || "";
      if (!workspacePath) {
        sendJson(response, 400, { ok: false, error: "path is required." });
        return;
      }

      const device = getOrCreateWorkspaceDevice(workspacePath);
      device.status = "running";
      device.lastStartedAt = new Date().toISOString();

      emitRuntimeEvent("workspace:device_started", device.id, "system", "System", {
        workspacePath,
        deviceName: device.name,
      });

      sendJson(response, 200, { ok: true, device: serializeWorkspaceDevice(device) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/workspace/device/stop") {
      const body = await readJson(request);
      const workspacePath = body?.path || body?.workspacePath || "";
      if (!workspacePath) {
        sendJson(response, 400, { ok: false, error: "path is required." });
        return;
      }

      const device = workspaceDevices.get(resolve(workspacePath));
      if (device) {
        device.status = "stopped";
        device.lastStoppedAt = new Date().toISOString();
      }

      emitRuntimeEvent("workspace:device_stopped", device?.id || "unknown", "system", "System", {
        workspacePath,
      });

      sendJson(response, 200, { ok: true, device: serializeWorkspaceDevice(device) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/v1/workspace/device/files") {
      const workspacePath = (url.searchParams.get("path") || "").trim();
      const dirPath = (url.searchParams.get("dir") || ".").trim();

      if (!workspacePath) {
        sendJson(response, 400, { ok: false, error: "path parameter is required." });
        return;
      }

      const device = getOrCreateWorkspaceDevice(workspacePath);
      const targetDir = resolve(device.path, dirPath);

      if (!isPathInsideWorkspace(device.path, targetDir)) {
        sendJson(response, 403, { ok: false, error: "Directory is outside the workspace." });
        return;
      }

      try {
        const entries = readdirSync(targetDir, { withFileTypes: true }).map((entry) => {
          const fullPath = resolve(targetDir, entry.name);
          let size = 0;
          let modifiedAt = new Date().toISOString();
          try {
            const stats = statSync(fullPath);
            size = stats.size;
            modifiedAt = stats.mtime.toISOString();
          } catch {}

          return {
            path: relative(device.path, fullPath),
            name: entry.name,
            type: entry.isDirectory() ? "directory" : entry.isSymbolicLink() ? "symlink" : "file",
            size,
            modifiedAt,
            permissions: "",
          };
        });

        sendJson(response, 200, { ok: true, files: entries, path: dirPath });
      } catch (err) {
        sendJson(response, 500, { ok: false, error: `Failed to list files: ${err.message}` });
      }
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/auth/github/device/start") {
      const result = await startGitHubDeviceFlow();
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/auth/github/device/poll") {
      const body = await readJson(request);
      const result = await pollGitHubDeviceFlow(body?.deviceCode);
      sendJson(response, 200, result);
      return;
    }

    if (request.method === "POST" && url.pathname === "/v1/auth/github/logout") {
      sendJson(response, 200, clearGitHubOAuthToken());
      return;
    }


    // -------------------------------------------------------------------------
    // Phase 3 — Module 12: Pinned Anchor Points
    // -------------------------------------------------------------------------

    if (request.method === "GET" && url.pathname.match(/^\/v1\/memory\/[^/]+\/pinned$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/memory/".length, -"/pinned".length));
      const thread = agentMemoryStore.get(agentId);
      const pinned = thread?.pinnedMessageIds ?? [];
      sendJson(response, 200, { ok: true, pinnedMessageIds: pinned });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/memory\/[^/]+\/pinned$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/memory/".length, -"/pinned".length));
      const body = await readJson(request);
      const messageId = body?.messageId;
      if (!messageId) {
        sendJson(response, 400, { ok: false, error: "messageId is required." });
        return;
      }
      const thread = getOrCreateThread(agentId);
      if (!thread.pinnedMessageIds) thread.pinnedMessageIds = [];
      if (!thread.pinnedMessageIds.includes(messageId)) {
        thread.pinnedMessageIds.push(messageId);
      }
      sendJson(response, 200, { ok: true, pinnedMessageIds: thread.pinnedMessageIds });
      return;
    }

    if (request.method === "DELETE" && url.pathname.match(/^\/v1\/memory\/[^/]+\/pinned\/[^/]+$/)) {
      const parts = url.pathname.slice("/v1/memory/".length).split("/");
      const agentId = decodeURIComponent(parts[0]);
      const messageId = decodeURIComponent(parts[2]);
      const thread = agentMemoryStore.get(agentId);
      if (thread?.pinnedMessageIds) {
        thread.pinnedMessageIds = thread.pinnedMessageIds.filter((id) => id !== messageId);
      }
      sendJson(response, 200, { ok: true, pinnedMessageIds: thread?.pinnedMessageIds ?? [] });
      return;
    }

    // -------------------------------------------------------------------------
    // Phase 3 — Module 13: Batch Execute (Parallel Execution Engine)
    // -------------------------------------------------------------------------

    if (request.method === "POST" && url.pathname === "/v1/execute/batch") {
      const body = await readJson(request);
      const { agent, commands } = body;

      if (!agent || !Array.isArray(commands) || commands.length === 0) {
        sendJson(response, 400, { ok: false, error: "agent and commands[] are required." });
        return;
      }

      const batchResults = await Promise.allSettled(
        commands.map((cmd, index) =>
          runCommand({ agent, command: cmd.command, cwd: cmd.cwd || agent.workspace })
            .then((result) => ({ ...result, commandIndex: index }))
        )
      );

      const results = batchResults.map((outcome, index) => {
        if (outcome.status === "fulfilled") {
          return { ...outcome.value, commandIndex: index };
        }
        return {
          ok: false,
          commandIndex: index,
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        };
      });

      sendJson(response, 200, { ok: true, results });
      return;
    }

    // -------------------------------------------------------------------------
    // Phase 3 — Module 14: Approval Queue
    // -------------------------------------------------------------------------

    if (request.method === "GET" && url.pathname === "/v1/approvals") {
      const queue = phase3ApprovalQueue.map((item) => ({ ...item }));
      sendJson(response, 200, { ok: true, queue });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/approvals\/[^/]+\/approve$/)) {
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      const item = phase3ApprovalQueue.find((i) => i.id === id);
      if (!item) {
        sendJson(response, 404, { ok: false, error: "Approval item not found." });
        return;
      }
      item.decision = "approved";
      item.resolvedAt = new Date().toISOString();
      emitRuntimeEvent("run:resumed", item.runId || id, item.agentId, item.agentName, { approvalId: id });
      sendJson(response, 200, { ok: true, item });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/approvals\/[^/]+\/reject$/)) {
      const id = decodeURIComponent(url.pathname.split("/")[3]);
      const item = phase3ApprovalQueue.find((i) => i.id === id);
      if (!item) {
        sendJson(response, 404, { ok: false, error: "Approval item not found." });
        return;
      }
      item.decision = "rejected";
      item.resolvedAt = new Date().toISOString();
      emitRuntimeEvent("run:canceled", item.runId || id, item.agentId, item.agentName, { approvalId: id, reason: "rejected_by_user" });
      sendJson(response, 200, { ok: true, item });
      return;
    }

    // -------------------------------------------------------------------------
    // Phase 3 — Module 14: Trust Policies
    // -------------------------------------------------------------------------

    if (request.method === "GET" && url.pathname.match(/^\/v1\/trust\/[^/]+$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/trust/".length));
      const policy = phase3TrustPolicies.get(agentId) ?? {
        agentId,
        autoApproveSafe: false,
        allowedPatterns: [],
        blockedPatterns: [],
        updatedAt: new Date().toISOString(),
      };
      sendJson(response, 200, { ok: true, policy });
      return;
    }

    if (request.method === "PUT" && url.pathname.match(/^\/v1\/trust\/[^/]+$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/trust/".length));
      const body = await readJson(request);
      const existing = phase3TrustPolicies.get(agentId) ?? {
        agentId,
        autoApproveSafe: false,
        allowedPatterns: [],
        blockedPatterns: [],
      };
      const updated = {
        ...existing,
        ...body,
        agentId,
        updatedAt: new Date().toISOString(),
      };
      phase3TrustPolicies.set(agentId, updated);
      sendJson(response, 200, { ok: true, policy: updated });
      return;
    }


    // -------------------------------------------------------------------------
    // Phase 4 — Module 18: Digital Twin Profile
    // -------------------------------------------------------------------------

    if (request.method === "GET" && url.pathname === "/v1/profile") {
      sendJson(response, 200, { ok: true, profile: phase4UserProfile });
      return;
    }

    if (request.method === "PUT" && url.pathname === "/v1/profile") {
      const body = await readJson(request);
      phase4UserProfile = {
        ...phase4UserProfile,
        ...body,
        updatedAt: new Date().toISOString(),
      };
      sendJson(response, 200, { ok: true, profile: phase4UserProfile });
      return;
    }

    // -------------------------------------------------------------------------
    // Phase 4 — Module 17: Meta-Reflection Events
    // -------------------------------------------------------------------------

    if (request.method === "POST" && url.pathname === "/v1/reflection/events") {
      const body = await readJson(request);
      const { agentId, agentName, type, description, metadata } = body;
      if (!agentId || !type || !description) {
        sendJson(response, 400, { ok: false, error: "agentId, type, and description are required." });
        return;
      }
      const event = {
        id: `evt_${randomUUID()}`,
        agentId,
        agentName: agentName || agentId,
        type,
        description,
        metadata: metadata || {},
        occurredAt: new Date().toISOString(),
      };
      phase4LearningEvents.push(event);
      // Keep a max of 500 events
      if (phase4LearningEvents.length > 500) phase4LearningEvents.splice(0, phase4LearningEvents.length - 500);
      sendJson(response, 200, { ok: true, event });
      return;
    }

    if (request.method === "GET" && url.pathname.match(/^\/v1\/reflection\/[^/]+$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/reflection/".length));
      const agentEvents = phase4LearningEvents.filter((e) => e.agentId === agentId);
      const grouped = {};
      for (const event of agentEvents) {
        if (!grouped[event.type]) grouped[event.type] = [];
        grouped[event.type].push(event);
      }
      const failurePatterns = Object.entries(grouped).map(([type, evts]) => ({
        type,
        count: evts.length,
        examples: evts.slice(0, 3).map((e) => e.description),
      })).sort((a, b) => b.count - a.count);

      const report = {
        agentId,
        totalEvents: agentEvents.length,
        failurePatterns,
        strongestPattern: failurePatterns[0] ?? null,
        generatedAt: new Date().toISOString(),
      };
      phase4ReflectionsByAgent.set(agentId, report);
      sendJson(response, 200, { ok: true, report });
      return;
    }

    if (request.method === "POST" && url.pathname.match(/^\/v1\/reflection\/[^/]+\/apply$/)) {
      const agentId = decodeURIComponent(url.pathname.slice("/v1/reflection/".length, -"/apply".length));
      const body = await readJson(request);
      const { patchedSystemPrompt } = body;
      if (!patchedSystemPrompt) {
        sendJson(response, 400, { ok: false, error: "patchedSystemPrompt is required." });
        return;
      }
      // Store the patched prompt in agent notes for reference
      if (!agentNotesStore.has(agentId)) agentNotesStore.set(agentId, []);
      agentNotesStore.get(agentId).push({
        id: `patch_${randomUUID()}`,
        agentId,
        title: "Reflection Prompt Patch",
        content: patchedSystemPrompt,
        tags: ["reflection", "auto-generated"],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      sendJson(response, 200, { ok: true, agentId, patchedAt: new Date().toISOString() });
      return;
    }

    // -------------------------------------------------------------------------
    // Phase 4 — Module 16: Dynamic Agent Creator
    // -------------------------------------------------------------------------

    if (request.method === "POST" && url.pathname === "/v1/agents/create-from-gap") {
      const body = await readJson(request);
      const { gap, userProfile } = body;
      if (!gap?.missingCapability) {
        sendJson(response, 400, { ok: false, error: "gap.missingCapability is required." });
        return;
      }

      const ROLE_BLUEPRINTS = [
        { keywords: ["ui","ux","design","landing","frontend","css"], name: "Designer", emoji: "🎨", role: gap.missingCapability, skills: gap.suggestedSkills || [], terminal: false, browser: true, files: true },
        { keywords: ["test","qa","quality"], name: "QA Engineer", emoji: "🧪", role: gap.missingCapability, skills: gap.suggestedSkills || [], terminal: true, browser: false, files: true },
        { keywords: ["devops","docker","ci","cd","deploy"], name: "DevOps Agent", emoji: "⚙️", role: gap.missingCapability, skills: gap.suggestedSkills || [], terminal: true, browser: false, files: true },
      ];

      const profile = userProfile || phase4UserProfile;
      const techHint = profile.techStack?.slice(0, 3).join(", ") || "";
      const systemPromptParts = [
        `You are a specialist ${gap.missingCapability} agent in a multi-agent workspace.`,
        `Your primary skills are: ${(gap.suggestedSkills || []).join(", ")}.`,
        `Focus exclusively on tasks that fit your specialty.`,
      ];
      if (techHint) systemPromptParts.push(`User's preferred tech stack: ${techHint}.`);

      const blueprint = {
        name: gap.suggestedName || "Specialist Agent",
        emoji: "🤖",
        objective: `${gap.missingCapability} — ${(gap.suggestedSkills || []).slice(0, 2).join(" & ")}`,
        systemPrompt: systemPromptParts.join("\n\n"),
        provider: "Anthropic",
        model: "claude-3-7-sonnet",
        sandboxMode: gap.needsTerminal ? "workspace-write" : "read-only",
        permissions: {
          terminal: Boolean(gap.needsTerminal),
          browser: Boolean(gap.needsBrowser),
          files: Boolean(gap.needsFiles),
          git: Boolean(gap.needsTerminal),
          delegation: false,
        },
      };

      phase4BlueprintRegistry.push({ ...blueprint, createdAt: new Date().toISOString() });
      sendJson(response, 200, { ok: true, blueprint });
      return;
    }

    sendJson(response, 404, { error: "Not found" });


  } catch (error) {
    if (response.headersSent) {
      if (!response.writableEnded) {
        response.end();
      }
      return;
    }

    sendJson(response, 500, {
      error: error instanceof Error ? error.message : "Unknown runtime error",
    });
  }
});

server.on("error", (error) => {
  log(error instanceof Error ? error.message : "Failed to start local runtime server.");
  process.exit(1);
});

loadCopilotSession();
loadConnectorSessions();
loadAutomationState();

server.listen(port, host, () => {
  log(`listening on http://${host}:${port}`);
  log(`provider availability: ${JSON.stringify(providerAvailability())}`);
});
