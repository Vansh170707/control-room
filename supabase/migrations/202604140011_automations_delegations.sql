create table if not exists public.workspace_automation_triggers (
  id text primary key,
  workspace_id text not null default 'default',
  agent_id text not null,
  name text not null,
  trigger_type text not null check (trigger_type in ('schedule', 'webhook', 'repo_push', 'repo_pr_opened', 'repo_pr_merged', 'manual')),
  trigger_config jsonb not null default '{}'::jsonb,
  action_type text not null check (action_type in ('chat', 'command', 'tool_invocation', 'delegation')),
  action_payload jsonb not null default '{}'::jsonb,
  status text not null default 'active' check (status in ('active', 'paused', 'disabled', 'error')),
  last_run_at timestamptz,
  last_run_status text,
  run_count integer not null default 0,
  error_count integer not null default 0,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspace_automation_triggers_agent_id_idx
on public.workspace_automation_triggers (agent_id, status);

alter table public.workspace_automation_triggers enable row level security;

create policy "Allow all operations for workspace_automation_triggers"
on public.workspace_automation_triggers for all to anon, authenticated using (true) with check (true);

alter publication supabase_realtime add table public.workspace_automation_triggers;

alter table public.workspace_delegations
  add column if not exists input_contract jsonb default '{}'::jsonb,
  add column if not exists output_contract jsonb default '{}'::jsonb,
  add column if not exists parent_delegation_id text,
  add column if not exists parent_run_id text,
  add column if not exists cancellation_reason text,
  add column if not exists canceled_at timestamptz,
  add column if not exists dependency_ids jsonb default '[]'::jsonb;

create index if not exists workspace_delegations_parent_idx
on public.workspace_delegations (parent_delegation_id)
where parent_delegation_id is not null;

create table if not exists public.run_trees (
  id text primary key,
  root_run_id text not null,
  parent_run_id text,
  child_run_ids jsonb not null default '[]'::jsonb,
  depth integer not null default 0,
  agent_id text not null,
  delegation_id text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists run_trees_root_idx
on public.run_trees (root_run_id);

create index if not exists run_trees_parent_idx
on public.run_trees (parent_run_id);

alter table public.run_trees enable row level security;

create policy "Allow all operations for run_trees"
on public.run_trees for all to anon, authenticated using (true) with check (true);

alter publication supabase_realtime add table public.run_trees;

drop trigger if exists set_workspace_automation_triggers_updated_at on public.workspace_automation_triggers;
create trigger set_workspace_automation_triggers_updated_at
before update on public.workspace_automation_triggers
for each row execute function public.set_updated_at();
