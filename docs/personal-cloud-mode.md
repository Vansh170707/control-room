# Personal Cloud Mode

This is the best setup for using Control Room from a deployed website while still letting agents work on your laptop.

## Recommended Architecture

```text
Deployed Control Room UI
        |
Supabase database + Edge Functions
        |
Outbound polling
        |
Tiny local OpenClaw bridge on your laptop
        |
Your files, shell, local tools, and workspace
```

The deployed site never opens a public port on your laptop. Your laptop only makes outbound requests to Supabase, claims pending commands, runs them locally, and reports results back.

## Why This Is Better For Personal Use

- Your laptop does not run the full web app or heavy runtime.
- Your laptop is not exposed directly to the internet.
- The deployed UI works from anywhere you can log in.
- Local machine access is controlled by one bridge process and one shared secret.
- You can stop local access instantly by closing the bridge terminal.

Tailscale is still useful if you later need direct private networking between a cloud server and your laptop, but this repo already has the Supabase queue pattern built in, so the polling bridge is simpler and safer to start with.

## One-Time Supabase Setup

1. Create or open your Supabase project.
2. Apply the migrations in `supabase/migrations`.
3. Set Edge Function secrets:

```bash
supabase secrets set CLAWBUDDY_INGEST_SECRET="use-a-long-random-secret"
```

4. Deploy the functions:

```bash
supabase functions deploy agent-ingest
supabase functions deploy issue-command
supabase functions deploy claim-command
```

## Deploy The Website

Deploy the Vite app to Vercel, Netlify, Cloudflare Pages, or any static host.

For personal use, protect the deployment with your host's access controls or add proper Supabase Auth before sharing the URL. Do not rely on a `VITE_` environment variable as a private password because Vite exposes those values to the browser bundle.

Set these environment variables in the hosting dashboard:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
CLAWBUDDY_SUPABASE_URL=https://your-project-ref.supabase.co
CLAWBUDDY_INGEST_SECRET=the-same-long-secret-from-supabase
VITE_CLOUD_BRIDGE_AGENT_ID=alpha
```

Do not set `VITE_AGENT_RUNTIME_URL` for personal cloud mode unless you intentionally deploy a separate runtime API. The local-machine bridge uses Supabase, not a public localhost URL.

## Start Local Computer Access

On your laptop:

```bash
cp .env.agent.example .env.agent.local
```

Fill in:

```env
CLAWBUDDY_SUPABASE_URL=https://your-project-ref.supabase.co
CLAWBUDDY_INGEST_SECRET=the-same-long-secret-from-supabase
CLAWBUDDY_AGENT_ID=alpha
CLAWBUDDY_WORKDIR=/Users/you/path/to/workspace
CLAWBUDDY_REQUIRE_COMMAND_ALLOWLIST=true
CLAWBUDDY_COMMAND_ALLOWLIST=openclaw,npm,pnpm,yarn,node,git
CLAWBUDDY_ALLOW_SHELL_OPERATORS=false
```

Then run:

```bash
npm run agent:cloud
```

The bridge now shows as online in the deployed dashboard and can claim commands for the configured agent.

## Multiple OpenClaw Agents

If you already have `~/.openclaw/openclaw.json` with multiple agents, use:

```bash
npm run agent:all
```

That script starts one polling bridge per configured OpenClaw agent.

## Safety Notes

- Keep `CLAWBUDDY_INGEST_SECRET` private. It authorizes command creation and local bridge polling.
- Keep `CLAWBUDDY_REQUIRE_COMMAND_ALLOWLIST=true` for a deployed personal dashboard.
- Keep `CLAWBUDDY_ALLOW_SHELL_OPERATORS=false` unless you intentionally want chained shell commands like `&&`, `|`, or `;`.
- The bridge blocks `sudo`, `rm -rf /`, `dd if=`, and fork-bomb patterns by default.
- Add only the commands you actually need to `CLAWBUDDY_COMMAND_ALLOWLIST`.
- Stop local computer access by stopping the `npm run agent:cloud` process.
