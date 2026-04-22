# Control Room

Control Room is becoming a personal multi-agent workspace: you create custom agents, assign each one a model/provider, give them specialties and permissions, and run them against your own API keys plus local sandboxes.

The current build now has two real layers:

- a Nebula-style agent workspace UI in [src/App.tsx](./src/App.tsx)
- a local runtime server in [scripts/agent-runtime-server.mjs](./scripts/agent-runtime-server.mjs) that can call OpenAI, Anthropic, OpenRouter, Gemini, Groq, or GitHub Models using your own keys

The older Supabase/OpenClaw bridge is still in the repo and still works as legacy infrastructure, but the product direction is now the personal-agent workspace.

## What works right now

- Custom agents can be created and edited in the UI
- Agent profiles persist locally in browser storage
- Custom agents have provider, model, objective, prompt, workspace, sandbox mode, and tool permissions
- The thread workspace can call a local runtime when `VITE_AGENT_RUNTIME_URL` is configured
- Terminal-enabled custom agents can run sandboxed commands from the right-side runner panel
- Delegations can now be created as thread handoffs, sandbox commands, or manual tasks
- Risky sandbox commands pause for approval before they run, whether they came from the runner panel or a delegation
- Custom agents, delegations, threads, and command runs can persist to Supabase when the workspace migration is applied
- The workspace remembers your selected agent and current view locally between sessions
- The runtime supports OpenAI, Anthropic, OpenRouter, Gemini, and Groq today
- GitHub Models is now available with either `GITHUB_MODELS_TOKEN`/`GITHUB_TOKEN` or local GitHub device OAuth login
- A guarded terminal execution endpoint exists in the runtime for the next phase of coding-agent wiring

## Quick start

1. Install dependencies:

```bash
npm install
```

2. Copy the frontend env:

```bash
cp .env.example .env.local
```

3. Add the local runtime URL:

```bash
VITE_AGENT_RUNTIME_URL=http://127.0.0.1:8787
```

`VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are still optional unless you also want the legacy live agent/event/log sync.

If you want the new workspace state to persist in Supabase too, make sure you apply the latest migration in `supabase/migrations`, especially:

```bash
export SUPABASE_DB_PASSWORD="your-project-db-password"
npx supabase db push
```

If `npx supabase db push` fails with an error like `unexpected login role status 400` or `permission denied to alter role cli_login_postgres`, the CLI is missing your project database password. Get it from Supabase Dashboard -> `Project Settings` -> `Database`, then either:

```bash
export SUPABASE_DB_PASSWORD="your-project-db-password"
npx supabase db push
```

or relink with the password explicitly:

```bash
npx supabase link --project-ref YOUR_PROJECT_REF --password "your-project-db-password"
```

4. Copy the runtime env:

```bash
cp .env.runtime.example .env.runtime.local
```

5. Add whichever provider keys you want to use:

```bash
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
OPENROUTER_API_KEY=...
GEMINI_API_KEY=...
GROQ_API_KEY=...
GITHUB_MODELS_TOKEN=...
```

Optional (for browser-based Copilot-style OAuth login in the UI):

```bash
GITHUB_OAUTH_CLIENT_ID=...
GITHUB_OAUTH_CLIENT_SECRET=...
GITHUB_OAUTH_SCOPE=models:read
```

6. Start the local runtime:

```bash
npm run runtime:dev
```

7. In another terminal, start the frontend:

```bash
npm run dev
```

## Runtime API

The local runtime is intentionally simple and local-first.

### `GET /health`

Returns whether the runtime is up and which provider keys are present.

### `POST /v1/chat`

Used by the frontend thread workspace to get a real model response.

Request shape:

```json
{
  "agent": {
    "id": "builder",
    "name": "Builder",
    "provider": "Anthropic",
    "model": "claude-3-7-sonnet",
    "objective": "Ship code and terminal work in a local sandbox.",
    "systemPrompt": "You are a precise coding agent...",
    "sandboxMode": "workspace-write",
    "workspace": "/workspace/control-room",
    "permissions": {
      "terminal": true,
      "browser": false,
      "files": true,
      "git": true,
      "delegation": false
    }
  },
  "messages": [
    { "role": "user", "content": "Help me plan the runtime wiring." }
  ]
}
```

### `POST /v1/execute`

This guarded terminal endpoint is now wired into the UI for terminal-enabled custom agents.

It currently:

- requires terminal permission on the agent
- requires a workspace path
- blocks obviously dangerous commands
- restricts read-only sandboxes to inspection-style commands
- works with a UI approval step for commands that look risky but are still allowed

The UI sends commands here from the right-side sandbox runner panel and stores recent runs locally per agent.

### `POST /v1/auth/github/device/start`

Starts GitHub Device Flow for Copilot-style login.

Returns `deviceCode`, `userCode`, `verificationUri`, `verificationUriComplete`, `expiresIn`, and `interval`.

### `POST /v1/auth/github/device/poll`

Polls GitHub Device Flow with:

```json
{
  "deviceCode": "..."
}
```

Returns one of:

- `ok: false, pending: true` while waiting for browser authorization
- `ok: true, authenticated: true` when token is issued and cached in local runtime memory
- `ok: false` with `error` for failures/expiry

### `POST /v1/auth/github/logout`

Clears the cached OAuth token from runtime memory.

## Delegation orchestration

Delegations are no longer just visual cards.

Each task can now be created in one of three modes:

- `Thread`: send a delegated instruction into the assignee's thread and, when the runtime is online, ask the model to respond
- `Command`: run a sandbox command on the assignee if that agent has terminal permission
- `Manual`: coordination-only task with no automatic execution

You can also auto-dispatch a delegation immediately when you create it.

Risky delegated commands do not fire blindly: they pause for approval first, then continue through the same sandbox execution path as direct runner commands.

## Workspace persistence

When Supabase is configured and the workspace tables exist, the app now persists:

- custom agent profiles
- delegations
- thread messages
- sandbox command runs

The currently selected agent and workspace view are also remembered locally in the browser so the workspace reopens where you left it.

If the migration has not been applied yet, the UI will fall back to local storage and show `Workspace Fallback` until the new tables are available.

## Supported providers

Right now the runtime supports:

- OpenAI via the Responses API
- Anthropic via the Messages API
- OpenRouter via Chat Completions
- Gemini via `generateContent`
- Groq via OpenAI-compatible Chat Completions
- GitHub Models via `https://models.github.ai/inference/chat/completions`

Typical provider/model pairs that now work cleanly:

- `OpenAI` + `gpt-4.1`
- `Anthropic` + `claude-3-7-sonnet`
- `Gemini` + `gemini-2.5-flash`
- `Groq` + `llama-3.3-70b-versatile`
- `OpenRouter` + `google/gemini-2.5-pro`
- `GitHub` + `openai/gpt-4.1`
- `Copilot` + `openai/gpt-4.1-mini`

## Scripts

- `npm run dev`: start the Vite app
- `npm run build`: typecheck and production build
- `npm run runtime:dev`: start the local model runtime
- `npm run agent:heartbeat`: legacy OpenClaw bridge heartbeat
- `npm run agent:poll`: legacy OpenClaw polling bridge
- `npm run agent:run`: legacy OpenClaw wrapped command runner

## Legacy Supabase / OpenClaw notes

The repo still includes:

- Supabase migrations and edge functions for `agents`, `agent_events`, `ai_logs`, and `agent_commands`
- the OpenClaw-friendly bridge in [scripts/openclaw-agent.mjs](./scripts/openclaw-agent.mjs)

That older path is still useful as reference infrastructure, but it is no longer the product center of gravity.

## Next build steps

- Add a real approval queue with per-agent trust policies instead of a single global command review dialog
- Persist workspace context and approval history across devices, not just locally
- Add agent-to-agent orchestration that can propose delegations automatically instead of only manual handoffs
- Tighten the old Supabase security policies before relying on them for anything sensitive

## Security note

This is still a personal-use prototype. Keep the runtime bound to localhost, store API keys only in `.env.runtime.local`, and do not expose the runtime server directly to the public internet.
