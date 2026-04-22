create table if not exists public.workspace_tool_invocations (
  id text primary key,
  workspace_id text not null default 'default',
  agent_id text not null,
  tool text not null,
  parameters jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'running', 'completed', 'failed', 'blocked', 'waiting_for_approval', 'canceled')),
  risk_level text not null default 'safe' check (risk_level in ('safe', 'low', 'medium', 'high', 'critical')),
  requires_approval boolean not null default false,
  approval_request_id text,
  result jsonb not null default '{}'::jsonb,
  duration_ms integer,
  error text not null default '',
  created_at timestamptz not null default timezone('utc', now()),
  completed_at timestamptz
);

create index if not exists workspace_tool_invocations_workspace_id_idx
on public.workspace_tool_invocations (workspace_id, created_at desc);

create index if not exists workspace_tool_invocations_agent_id_idx
on public.workspace_tool_invocations (agent_id, created_at desc);

drop trigger if exists set_workspace_tool_invocations_updated_at on public.workspace_tool_invocations;
create trigger set_workspace_tool_invocations_updated_at
before update on public.workspace_tool_invocations
for each row
execute function public.set_updated_at();

create table if not exists public.workspace_tool_approvals (
  id text primary key,
  workspace_id text not null default 'default',
  agent_id text not null,
  tool text not null,
  parameters jsonb not null default '{}'::jsonb,
  risk_level text not null default 'medium' check (risk_level in ('safe', 'low', 'medium', 'high', 'critical')),
  reasons jsonb not null default '[]'::jsonb,
  preview jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired')),
  resolved_by text,
  resolved_at timestamptz,
  expires_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspace_tool_approvals_workspace_id_idx
on public.workspace_tool_approvals (workspace_id, created_at desc);

create index if not exists workspace_tool_approvals_status_idx
on public.workspace_tool_approvals (status, expires_at);

alter table public.workspace_tool_invocations enable row level security;
alter table public.workspace_tool_approvals enable row level security;

create policy "Allow all operations for workspace_tool_invocations"
on public.workspace_tool_invocations
for all
to anon, authenticated
using (true)
with check (true);

create policy "Allow all operations for workspace_tool_approvals"
on public.workspace_tool_approvals
for all
to anon, authenticated
using (true)
with check (true);

alter publication supabase_realtime add table public.workspace_tool_invocations;
alter publication supabase_realtime add table public.workspace_tool_approvals;
