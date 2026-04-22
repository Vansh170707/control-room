create table if not exists public.workspace_agents (
  id text primary key,
  workspace_id text not null default 'default',
  name text not null,
  emoji text not null default '🤖',
  subtitle text not null default '',
  type text not null default 'Custom Agent',
  role text not null,
  accent text not null default '#10b981',
  status text not null default 'idle' check (status in ('active', 'idle', 'error', 'offline')),
  current_activity text not null default 'Standing by',
  last_seen timestamptz not null default timezone('utc', now()),
  tasks_completed integer not null default 0,
  accuracy numeric(5,2) not null default 0,
  skills jsonb not null default '[]'::jsonb,
  source text not null default 'custom' check (source in ('custom', 'connected')),
  provider text not null,
  model text not null,
  objective text not null default '',
  system_prompt text not null default '',
  specialties jsonb not null default '[]'::jsonb,
  tools jsonb not null default '[]'::jsonb,
  workspace_path text not null default '',
  sandbox_mode text not null default 'workspace-write' check (sandbox_mode in ('none', 'read-only', 'workspace-write')),
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspace_agents_workspace_id_idx
on public.workspace_agents (workspace_id, updated_at desc);

drop trigger if exists set_workspace_agents_updated_at on public.workspace_agents;
create trigger set_workspace_agents_updated_at
before update on public.workspace_agents
for each row
execute function public.set_updated_at();

create table if not exists public.workspace_delegations (
  id text primary key,
  workspace_id text not null default 'default',
  title text not null,
  from_agent_id text not null,
  assignee_id text not null,
  status text not null default 'queued' check (status in ('queued', 'active', 'blocked', 'done')),
  priority text not null default 'medium' check (priority in ('low', 'medium', 'high')),
  notes text not null default '',
  execution_mode text not null default 'manual' check (execution_mode in ('manual', 'thread', 'command')),
  payload text not null default '',
  cwd text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspace_delegations_workspace_id_idx
on public.workspace_delegations (workspace_id, updated_at desc);

drop trigger if exists set_workspace_delegations_updated_at on public.workspace_delegations;
create trigger set_workspace_delegations_updated_at
before update on public.workspace_delegations
for each row
execute function public.set_updated_at();

create table if not exists public.workspace_messages (
  id text primary key,
  workspace_id text not null default 'default',
  agent_id text not null,
  role text not null check (role in ('user', 'assistant', 'system')),
  sender text not null,
  content text not null,
  message_timestamp timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspace_messages_workspace_id_idx
on public.workspace_messages (workspace_id, message_timestamp asc);

create table if not exists public.workspace_command_runs (
  id text primary key,
  workspace_id text not null default 'default',
  agent_id text not null,
  command text not null,
  cwd text not null default '',
  status text not null default 'running' check (status in ('running', 'completed', 'failed')),
  exit_code integer,
  stdout text not null default '',
  stderr text not null default '',
  timed_out boolean not null default false,
  duration_ms integer,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspace_command_runs_workspace_id_idx
on public.workspace_command_runs (workspace_id, created_at desc);

alter table public.workspace_agents enable row level security;
alter table public.workspace_delegations enable row level security;
alter table public.workspace_messages enable row level security;
alter table public.workspace_command_runs enable row level security;

create policy "Allow all operations for workspace_agents"
on public.workspace_agents
for all
to anon, authenticated
using (true)
with check (true);

create policy "Allow all operations for workspace_delegations"
on public.workspace_delegations
for all
to anon, authenticated
using (true)
with check (true);

create policy "Allow all operations for workspace_messages"
on public.workspace_messages
for all
to anon, authenticated
using (true)
with check (true);

create policy "Allow all operations for workspace_command_runs"
on public.workspace_command_runs
for all
to anon, authenticated
using (true)
with check (true);

alter publication supabase_realtime add table public.workspace_agents;
alter publication supabase_realtime add table public.workspace_delegations;
alter publication supabase_realtime add table public.workspace_messages;
alter publication supabase_realtime add table public.workspace_command_runs;
