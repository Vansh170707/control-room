#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import os from "node:os";

async function readEnv(filePath) {
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const env = {};
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const index = trimmed.indexOf("=");
      if (index > 0) {
        env[trimmed.substring(0, index).trim()] = trimmed.substring(index + 1).trim();
      }
    }
    return env;
  } catch (error) {
    return null;
  }
}

async function main() {
  const rootDir = process.cwd();
  const envLocalPath = path.join(rootDir, ".env.agent.local");
  
  const baseEnv = await readEnv(envLocalPath) || {};
  
  if (!baseEnv.CLAWBUDDY_SUPABASE_URL || !baseEnv.CLAWBUDDY_INGEST_SECRET) {
    console.error("Missing CLAWBUDDY_SUPABASE_URL or CLAWBUDDY_INGEST_SECRET in .env.agent.local!");
    console.log("Please copy .env.agent.example to .env.agent.local and fill in the required core fields before running this script.");
    process.exit(1);
  }

  const openclawConfigPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  let openclawConfig;
  try {
    const content = await fs.readFile(openclawConfigPath, "utf-8");
    openclawConfig = JSON.parse(content);
  } catch (err) {
    console.error(`Failed to read OpenClaw config at ${openclawConfigPath}`, err);
    process.exit(1);
  }

  const agents = openclawConfig?.agents?.list || [];
  if (agents.length === 0) {
    console.warn("No OpenClaw agents found in your config.");
    process.exit(0);
  }

  console.log(`Found ${agents.length} OpenClaw agents: ${agents.map(a => a.id).join(", ")}`);
  console.log("Booting up polling workers for each...");

  const runnerScript = path.join(rootDir, "scripts", "openclaw-agent.mjs");
  
  const colors = ["#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#ec4899"];
  const emojis = ["🤖", "🧠", "💼", "🦉", "🔧"];

  for (let i = 0; i < agents.length; i++) {
    const agent = agents[i];
    const agentName = agent.id.charAt(0).toUpperCase() + agent.id.slice(1);
    
    // Setup specific env vars for each agent
    const agentEnv = {
      ...process.env,
      ...baseEnv,
      CLAWBUDDY_AGENT_ID: agent.id,
      CLAWBUDDY_AGENT_NAME: agentName,
      CLAWBUDDY_AGENT_EMOJI: emojis[i % emojis.length],
      CLAWBUDDY_AGENT_TYPE: "Local OpenClaw",
      CLAWBUDDY_AGENT_ROLE: "OpenClaw Node",
      CLAWBUDDY_AGENT_SUBTITLE: `Model: ${agent.model}`,
      CLAWBUDDY_AGENT_ACCENT: colors[i % colors.length],
      // Give each agent its specific workspace directory from openclaw metadata if any, or a fallback:
      CLAWBUDDY_WORKDIR: path.join(os.homedir(), ".openclaw", agent.id === "main" ? "workspace" : `workspace-${agent.id}`)
    };

    try {
      await fs.mkdir(agentEnv.CLAWBUDDY_WORKDIR, { recursive: true });
    } catch (e) {
      // ignore
    }

    console.log(`Starting worker for [${agent.id}] with model [${agent.model}]`);
    
    const child = spawn("node", [runnerScript, "poll"], {
      env: agentEnv,
      stdio: "inherit" // pipe stdout/stderr directly to main process
    });
    
    child.on('error', (err) => {
      console.error(`Failed to start worker for ${agent.id}`, err);
    });
  }
}

main().catch(console.error);
