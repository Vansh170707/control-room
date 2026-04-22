#!/usr/bin/env node

import { spawn } from "node:child_process";
import process from "node:process";

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

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
      resolve({
        exitCode: code ?? 1,
        stdout: trimOutput(stdout),
        stderr: trimOutput(stderr),
        durationMs: Date.now() - startedAt,
        timedOut,
      });
    });
  });
}

async function handleCommand(commandRecord) {
  const execution = normalizeExecution(commandRecord);
  const startedMessage = `Starting command ${commandRecord.id}: ${commandRecord.command}`;

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
