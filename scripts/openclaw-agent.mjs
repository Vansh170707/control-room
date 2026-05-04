#!/usr/bin/env node

import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, "..");

loadEnv({ path: resolve(rootDir, ".env.agent.local"), quiet: true });
loadEnv({ path: resolve(rootDir, ".env.local"), override: false, quiet: true });

const mode = process.argv[2];
const rest = process.argv.slice(3);

function usage() {
  console.log(`Usage:
  node scripts/openclaw-agent.mjs heartbeat
  node scripts/openclaw-agent.mjs poll
  node scripts/openclaw-agent.mjs run -- <command...>

Required env:
  CLAWBUDDY_SUPABASE_URL or CLAWBUDDY_FUNCTIONS_URL
  CLAWBUDDY_INGEST_SECRET
  CLAWBUDDY_AGENT_ID
`);
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

function sleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function trimOutput(value, limit = 12000) {
  if (!value) {
    return "";
  }

  return value.length > limit ? `${value.slice(0, limit)}\n...[truncated]` : value;
}

function cleanArtifactCandidate(value) {
  return String(value || "")
    .trim()
    .replace(/^file:\/\//i, "")
    .replace(/^[`"']+|[`"',;.)\]]+$/g, "");
}

function resolveArtifactCandidate(candidate, cwd) {
  let cleaned = cleanArtifactCandidate(candidate);

  if (!cleaned) {
    return "";
  }

  const home = process.env.HOME || "";
  if (home) {
    cleaned = cleaned.replace(/^\$HOME(?=\/|$)/, home).replace(/^~(?=\/|$)/, home);
  }

  return resolve(cwd, cleaned);
}

function artifactNameForPath(path) {
  return basename(path) || path;
}

function extractArtifactsFromCommandResult({ command, cwd, stdout, stderr }) {
  const candidates = new Set();
  const extensionPattern =
    "(?:pdf|txt|md|csv|tsv|json|jsonl|docx|xlsx|pptx|png|jpg|jpeg|webp|gif|svg|html|css|js|ts|tsx|py|sh|zip|tar|gz|mp3|mp4)";
  const sources = [command, stdout, stderr].filter(Boolean).join("\n");
  const optionRegex =
    /(?:^|\s)(?:-o|--output|--output-document|--outfile)\s+(?:"([^"]+)"|'([^']+)'|([^\s]+))/gi;
  const redirectRegex = /(?:^|\s)(?:>|1>|2>)\s*(?:"([^"]+)"|'([^']+)'|([^\s]+))/g;
  const quotedPathRegex = new RegExp(
    `["']((?:~|\\$HOME|/)[^"'\n]+?\\.${extensionPattern})["']`,
    "gi",
  );
  const markerPathRegex = new RegExp(
    `\\b(?:CREATED|SAVED|WROTE|WRITTEN|DOWNLOADED|GENERATED|OUTPUT|FILE):?\\s+((?:~|\\$HOME|/)[^\\n]+?\\.${extensionPattern})\\b`,
    "gi",
  );
  const absolutePathRegex = new RegExp(
    `(?:^|[\\s:=])((?:~|\\$HOME|/Users/|/tmp/|/var/|/private/tmp/)[^\\n"'<>|;&]*?\\.${extensionPattern})(?=$|[\\s,.;)\\]])`,
    "gi",
  );

  for (const regex of [optionRegex, redirectRegex]) {
    for (const match of sources.matchAll(regex)) {
      candidates.add(match[1] || match[2] || match[3] || "");
    }
  }

  for (const regex of [quotedPathRegex, markerPathRegex, absolutePathRegex]) {
    for (const match of sources.matchAll(regex)) {
      candidates.add(match[1] || "");
    }
  }

  return Array.from(candidates)
    .map((candidate) => resolveArtifactCandidate(candidate, cwd))
    .filter(Boolean)
    .filter((path, index, allPaths) => allPaths.indexOf(path) === index)
    .flatMap((path) => {
      try {
        if (!existsSync(path)) {
          return [];
        }
        const stats = statSync(path);
        if (!stats.isFile()) {
          return [];
        }
        return [
          {
            name: artifactNameForPath(path),
            type: "file",
            path,
            size: stats.size,
          },
        ];
      } catch {
        return [];
      }
    });
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCsvList(value) {
  return (value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseBoolean(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
}

const supabaseUrl = process.env.CLAWBUDDY_SUPABASE_URL;
const functionsBaseUrl =
  process.env.CLAWBUDDY_FUNCTIONS_URL ||
  (supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1` : undefined);
const ingestSecret = process.env.CLAWBUDDY_INGEST_SECRET;
const agentId = process.env.CLAWBUDDY_AGENT_ID;
const pollIntervalMs = Number(process.env.CLAWBUDDY_POLL_INTERVAL_MS ?? 5000);
const heartbeatMs = Number(process.env.CLAWBUDDY_HEARTBEAT_MS ?? 60000);
const baseWorkdir = process.env.CLAWBUDDY_WORKDIR || process.cwd();
const commandAllowlist = parseCsvList(process.env.CLAWBUDDY_COMMAND_ALLOWLIST);
const requireCommandAllowlist = parseBoolean(process.env.CLAWBUDDY_REQUIRE_COMMAND_ALLOWLIST);
const allowShellOperators = parseBoolean(process.env.CLAWBUDDY_ALLOW_SHELL_OPERATORS);
const disableBuiltinBlocklist = parseBoolean(process.env.CLAWBUDDY_DISABLE_BUILTIN_BLOCKLIST);
const blockedCommandPatterns = [
  ...(disableBuiltinBlocklist
    ? []
    : [
        "\\bsudo\\b",
        "\\brm\\s+-rf\\s+/(?:\\s|$)",
        "\\bdd\\s+if=",
        ":\\(\\)\\s*\\{\\s*:\\|:&\\s*\\};:",
      ]),
  ...parseCsvList(process.env.CLAWBUDDY_BLOCKED_COMMAND_PATTERNS),
]
  .map((pattern) => {
    try {
      return new RegExp(pattern, "i");
    } catch {
      console.warn(`Ignoring invalid CLAWBUDDY_BLOCKED_COMMAND_PATTERNS entry: ${pattern}`);
      return null;
    }
  })
  .filter(Boolean);

if (!mode || !["heartbeat", "poll", "run"].includes(mode)) {
  usage();
  process.exit(1);
}

if (!functionsBaseUrl) {
  fail("Missing CLAWBUDDY_SUPABASE_URL or CLAWBUDDY_FUNCTIONS_URL.");
}

if (!ingestSecret) {
  fail("Missing CLAWBUDDY_INGEST_SECRET.");
}

if (!agentId) {
  fail("Missing CLAWBUDDY_AGENT_ID.");
}

const agentDefaults = {
  id: agentId,
  name: process.env.CLAWBUDDY_AGENT_NAME || agentId,
  emoji: process.env.CLAWBUDDY_AGENT_EMOJI || "🤖",
  subtitle: process.env.CLAWBUDDY_AGENT_SUBTITLE || "OpenClaw worker",
  type: process.env.CLAWBUDDY_AGENT_TYPE || "OpenClaw Agent",
  role: process.env.CLAWBUDDY_AGENT_ROLE || "Autonomous Worker",
  accent: process.env.CLAWBUDDY_AGENT_ACCENT || "#10b981",
};

function buildAgentPayload(overrides = {}) {
  return {
    ...agentDefaults,
    lastSeen: new Date().toISOString(),
    ...overrides,
  };
}

async function callFunction(functionName, payload) {
  const response = await fetch(`${functionsBaseUrl}/${functionName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-clawbuddy-secret": ingestSecret,
    },
    body: JSON.stringify(payload),
  });

  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }

  if (!response.ok) {
    throw new Error(`${functionName} failed (${response.status}): ${body.error || response.statusText}`);
  }

  return body;
}

async function report({
  status,
  currentActivity,
  events = [],
  logs = [],
  commandUpdates = [],
}) {
  return callFunction("agent-ingest", {
    agent: buildAgentPayload({
      status,
      currentActivity,
    }),
    events,
    logs,
    commandUpdates,
  });
}

async function claimNextCommand() {
  const result = await callFunction("claim-command", {
    agentId,
  });

  if (!result.command || typeof result.command.id !== "string" || typeof result.command.command !== "string") {
    return null;
  }

  return result.command;
}

function normalizeExecution(commandRecord) {
  const payload = isPlainObject(commandRecord.payload) ? commandRecord.payload : {};
  const payloadEnv =
    isPlainObject(payload.env)
      ? Object.fromEntries(
          Object.entries(payload.env).filter(([, value]) => typeof value === "string"),
        )
      : {};

  let explicitCommand =
    typeof payload.command === "string" && payload.command.trim().length > 0
      ? payload.command.trim()
      : commandRecord.command;
  let explicitArgs =
    Array.isArray(payload.args) ? payload.args.map((value) => String(value)) : [];
  let shell = payload.shell === undefined ? explicitArgs.length === 0 : Boolean(payload.shell);

  if (explicitCommand.match(/^(ask|chat):\s*/i)) {
    const prompt = explicitCommand.replace(/^(ask|chat):\s*/i, "");
    explicitCommand = "openclaw";
    explicitArgs = ["agent", "--agent", agentDefaults.id, "--message", prompt];
    shell = false;
  }

  const cwd =
    typeof payload.cwd === "string" && payload.cwd.trim().length > 0
      ? payload.cwd
      : baseWorkdir;
  const timeoutSeconds =
    typeof payload.timeoutSeconds === "number" && payload.timeoutSeconds > 0
      ? payload.timeoutSeconds
      : 1800;
  const label =
    typeof payload.label === "string" && payload.label.trim().length > 0
      ? payload.label
      : `Running ${commandRecord.command}`;

  return {
    command: explicitCommand,
    args: explicitArgs,
    cwd,
    env: payloadEnv,
    shell,
    timeoutSeconds,
    label,
  };
}

function executionSummary(execution) {
  return execution.shell
    ? execution.command.trim()
    : [execution.command, ...execution.args].filter(Boolean).join(" ").trim();
}

function matchesAllowlist(execution) {
  if (commandAllowlist.length === 0) {
    return !requireCommandAllowlist;
  }

  const summary = executionSummary(execution);
  const executable = execution.command.trim();
  const executableName = basename(executable);

  return commandAllowlist.some((entry) => (
    summary === entry ||
    summary.startsWith(`${entry} `) ||
    executable === entry ||
    executableName === entry
  ));
}

function validateExecutionPolicy(execution) {
  const summary = executionSummary(execution);

  if (
    execution.shell &&
    !allowShellOperators &&
    (requireCommandAllowlist || commandAllowlist.length > 0) &&
    /[;&|`$<>]/.test(summary)
  ) {
    return {
      ok: false,
      reason:
        "Command blocked because shell operators are disabled by the local bridge safety policy. Set CLAWBUDDY_ALLOW_SHELL_OPERATORS=true only if you trust chained shell commands.",
    };
  }

  for (const pattern of blockedCommandPatterns) {
    if (pattern.test(summary)) {
      return {
        ok: false,
        reason: `Command blocked by local bridge safety policy: ${pattern.source}`,
      };
    }
  }

  if (!matchesAllowlist(execution)) {
    return {
      ok: false,
      reason:
        commandAllowlist.length === 0
          ? "Command blocked because CLAWBUDDY_REQUIRE_COMMAND_ALLOWLIST=true but CLAWBUDDY_COMMAND_ALLOWLIST is empty."
          : `Command is not in CLAWBUDDY_COMMAND_ALLOWLIST: ${summary}`,
    };
  }

  return { ok: true };
}

async function executeCommand({ command, args, cwd, env, shell, timeoutSeconds }) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const child = shell
      ? spawn(process.env.SHELL || "/bin/zsh", ["-lc", command], {
          cwd,
          env: { ...process.env, ...env },
          stdio: ["ignore", "pipe", "pipe"],
        })
      : spawn(command, args, {
          cwd,
          env: { ...process.env, ...env },
          stdio: ["ignore", "pipe", "pipe"],
        });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      setTimeout(() => child.kill("SIGKILL"), 2000).unref();
    }, timeoutSeconds * 1000);

    child.stdout.on("data", (chunk) => {
      const text = chunk.toString();
      stdout += text;
      process.stdout.write(text);
    });

    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      stderr += text;
      process.stderr.write(text);
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      clearTimeout(timeout);
      const trimmedStdout = trimOutput(stdout);
      const trimmedStderr = trimOutput(stderr);
      resolve({
        exitCode: code ?? 1,
        stdout: trimmedStdout,
        stderr: trimmedStderr,
        durationMs: Date.now() - startedAt,
        timedOut,
        cwd,
        artifacts: extractArtifactsFromCommandResult({
          command: shell ? command : [command, ...args].filter(Boolean).join(" "),
          cwd,
          stdout: trimmedStdout,
          stderr: trimmedStderr,
        }),
      });
    });
  });
}

async function handleCommand(commandRecord) {
  const execution = normalizeExecution(commandRecord);
  const startedMessage = `Starting command ${commandRecord.id}: ${commandRecord.command}`;
  const policy = validateExecutionPolicy(execution);

  if (!policy.ok) {
    await report({
      status: "error",
      currentActivity: `Blocked command: ${commandRecord.command}`,
      events: [
        {
          action: `blocked command ${commandRecord.id}: ${commandRecord.command}`,
        },
      ],
      logs: [
        {
          category: "reminder",
          message: policy.reason,
        },
      ],
      commandUpdates: [
        {
          id: commandRecord.id,
          status: "failed",
          result: {
            error: policy.reason,
          },
          payload: commandRecord.payload,
        },
      ],
    });
    return;
  }

  await report({
    status: "active",
    currentActivity: execution.label,
    events: [
      {
        action: `claimed command ${commandRecord.id}: ${commandRecord.command}`,
      },
    ],
    logs: [
      {
        category: "general",
        message: startedMessage,
      },
    ],
    commandUpdates: [
      {
        id: commandRecord.id,
        status: "running",
      },
    ],
  });

  try {
    const result = await executeCommand(execution);
    const success = result.exitCode === 0 && !result.timedOut;

    await report({
      status: success ? "idle" : "error",
      currentActivity: success ? "Standing by" : `Last command failed: ${commandRecord.command}`,
      events: [
        {
          action: success
            ? `completed command ${commandRecord.id}: ${commandRecord.command}`
            : `failed command ${commandRecord.id}: ${commandRecord.command}`,
        },
      ],
      logs: [
        {
          category: success ? "observation" : "reminder",
          message: success
            ? `Command ${commandRecord.command} completed in ${result.durationMs}ms.`
            : `Command ${commandRecord.command} failed with exit code ${result.exitCode}.`,
        },
      ],
      commandUpdates: [
        {
          id: commandRecord.id,
          status: success ? "completed" : "failed",
          result,
          payload: commandRecord.payload
        },
      ],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown execution error";

    await report({
      status: "error",
      currentActivity: `Last command failed: ${commandRecord.command}`,
      events: [
        {
          action: `command ${commandRecord.id} crashed before completion`,
        },
      ],
      logs: [
        {
          category: "reminder",
          message: `Command ${commandRecord.command} crashed: ${message}`,
        },
      ],
      commandUpdates: [
        {
          id: commandRecord.id,
          status: "failed",
          result: {
            error: message,
          },
        },
      ],
    });
  }
}

async function runWrappedCommand(commandParts) {
  if (commandParts.length === 0) {
    fail("Usage: node scripts/openclaw-agent.mjs run -- <command...>");
  }

  const shellCommand = commandParts.join(" ");

  await report({
    status: "active",
    currentActivity: `Manual run: ${shellCommand}`,
    events: [
      {
        action: `started manual run: ${shellCommand}`,
      },
    ],
    logs: [
      {
        category: "general",
        message: `Manual run started: ${shellCommand}`,
      },
    ],
  });

  try {
    const result = await executeCommand({
      command: shellCommand,
      args: [],
      cwd: baseWorkdir,
      env: {},
      shell: true,
      timeoutSeconds: 1800,
    });

    const success = result.exitCode === 0 && !result.timedOut;

    await report({
      status: success ? "idle" : "error",
      currentActivity: success ? "Standing by" : `Last manual run failed`,
      events: [
        {
          action: success
            ? `completed manual run: ${shellCommand}`
            : `failed manual run: ${shellCommand}`,
        },
      ],
      logs: [
        {
          category: success ? "observation" : "reminder",
          message: success
            ? `Manual run completed in ${result.durationMs}ms.`
            : `Manual run failed with exit code ${result.exitCode}.`,
        },
      ],
    });

    process.exit(success ? 0 : 1);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown execution error";

    await report({
      status: "error",
      currentActivity: "Last manual run failed",
      events: [
        {
          action: `manual run crashed: ${shellCommand}`,
        },
      ],
      logs: [
        {
          category: "reminder",
          message: `Manual run crashed: ${message}`,
        },
      ],
    });

    fail(message);
  }
}

async function sendHeartbeat() {
  await report({
    status: "idle",
    currentActivity: "Listening for commands",
  });
}

async function pollLoop() {
  let lastHeartbeat = 0;

  await report({
    status: "idle",
    currentActivity: "OpenClaw bridge online",
    events: [
      {
        action: "OpenClaw bridge started polling for commands",
      },
    ],
  });

  while (true) {
    const now = Date.now();

    if (now - lastHeartbeat >= heartbeatMs) {
      await sendHeartbeat().catch((error) => {
        console.error(error);
      });
      lastHeartbeat = now;
    }

    try {
      const commandRecord = await claimNextCommand();

      if (commandRecord) {
        await handleCommand(commandRecord);
        continue;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown polling error";
      console.error(message);
      await report({
        status: "error",
        currentActivity: "Command polling failed",
        logs: [
          {
            category: "reminder",
            message: `Polling failure: ${message}`,
          },
        ],
      }).catch(() => {});
    }

    await sleep(pollIntervalMs);
  }
}

if (mode === "heartbeat") {
  await sendHeartbeat();
  process.exit(0);
}

if (mode === "run") {
  const commandParts = rest[0] === "--" ? rest.slice(1) : rest;
  await runWrappedCommand(commandParts);
  process.exit(0);
}

await pollLoop();
