create table if not exists public.workspace_dispatcher_decisions (
  id text primary key,
  workspace_id text not null default 'default',
  lead_agent_id text not null,
  lane text not null default 'thread',
  intent text not null default 'general',
  risk_level text not null default 'safe',
  complexity_score integer not null default 0,
  requires_plan_review boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists workspace_dispatcher_decisions_workspace_id_idx
on public.workspace_dispatcher_decisions (workspace_id, created_at desc);

create index if not exists workspace_dispatcher_decisions_lead_agent_idx
on public.workspace_dispatcher_decisions (lead_agent_id, created_at desc);

create table if not exists public.workspace_context_packages (
  id text primary key,
  workspace_id text not null default 'default',
  agent_id text not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb
);

create unique index if not exists workspace_context_packages_workspace_agent_idx
on public.workspace_context_packages (workspace_id, agent_id);

drop trigger if exists set_workspace_context_packages_updated_at on public.workspace_context_packages;
create trigger set_workspace_context_packages_updated_at
before update on public.workspace_context_packages
for each row
execute function public.set_updated_at();

create table if not exists public.workspace_task_trees (
  id text primary key,
  workspace_id text not null default 'default',
  dispatcher_decision_id text not null,
  root_agent_id text not null,
  status text not null default 'planning',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists workspace_task_trees_workspace_id_idx
on public.workspace_task_trees (workspace_id, updated_at desc);

create index if not exists workspace_task_trees_root_agent_id_idx
on public.workspace_task_trees (root_agent_id, updated_at desc);

drop trigger if exists set_workspace_task_trees_updated_at on public.workspace_task_trees;
create trigger set_workspace_task_trees_updated_at
before update on public.workspace_task_trees
for each row
execute function public.set_updated_at();

create table if not exists public.workspace_verifier_reviews (
  id text primary key,
  workspace_id text not null default 'default',
  agent_id text not null,
  task_tree_id text,
  verdict text not null default 'approved',
  attempts integer not null default 1,
  created_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists workspace_verifier_reviews_workspace_id_idx
on public.workspace_verifier_reviews (workspace_id, created_at desc);

create index if not exists workspace_verifier_reviews_agent_id_idx
on public.workspace_verifier_reviews (agent_id, created_at desc);

create table if not exists public.workspace_plan_reviews (
  id text primary key,
  workspace_id text not null default 'default',
  dispatcher_decision_id text not null,
  status text not null default 'pending',
  risk_level text not null default 'safe',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists workspace_plan_reviews_workspace_id_idx
on public.workspace_plan_reviews (workspace_id, updated_at desc);

drop trigger if exists set_workspace_plan_reviews_updated_at on public.workspace_plan_reviews;
create trigger set_workspace_plan_reviews_updated_at
before update on public.workspace_plan_reviews
for each row
execute function public.set_updated_at();

create table if not exists public.workspace_circuit_breaker_events (
  id text primary key,
  workspace_id text not null default 'default',
  agent_id text not null,
  resolution text not null default 'continue',
  triggered_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists workspace_circuit_breaker_events_workspace_id_idx
on public.workspace_circuit_breaker_events (workspace_id, triggered_at desc);

create index if not exists workspace_circuit_breaker_events_agent_id_idx
on public.workspace_circuit_breaker_events (agent_id, triggered_at desc);

create table if not exists public.workspace_knowledge_graphs (
  id text primary key,
  workspace_id text not null default 'default',
  agent_id text not null,
  generated_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb
);

create unique index if not exists workspace_knowledge_graphs_workspace_agent_idx
on public.workspace_knowledge_graphs (workspace_id, agent_id);

drop trigger if exists set_workspace_knowledge_graphs_updated_at on public.workspace_knowledge_graphs;
create trigger set_workspace_knowledge_graphs_updated_at
before update on public.workspace_knowledge_graphs
for each row
execute function public.set_updated_at();

create table if not exists public.workspace_tool_drafts (
  id text primary key,
  workspace_id text not null default 'default',
  status text not null default 'draft',
  language text not null default 'typescript',
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists workspace_tool_drafts_workspace_id_idx
on public.workspace_tool_drafts (workspace_id, updated_at desc);

drop trigger if exists set_workspace_tool_drafts_updated_at on public.workspace_tool_drafts;
create trigger set_workspace_tool_drafts_updated_at
before update on public.workspace_tool_drafts
for each row
execute function public.set_updated_at();

alter table public.workspace_dispatcher_decisions enable row level security;
alter table public.workspace_context_packages enable row level security;
alter table public.workspace_task_trees enable row level security;
alter table public.workspace_verifier_reviews enable row level security;
alter table public.workspace_plan_reviews enable row level security;
alter table public.workspace_circuit_breaker_events enable row level security;
alter table public.workspace_knowledge_graphs enable row level security;
alter table public.workspace_tool_drafts enable row level security;

create policy "Allow all operations for workspace_dispatcher_decisions"
on public.workspace_dispatcher_decisions
for all
to anon, authenticated
using (true)
with check (true);

create policy "Allow all operations for workspace_context_packages"
on public.workspace_context_packages
for all
to anon, authenticated
using (true)
with check (true);

create policy "Allow all operations for workspace_task_trees"
on public.workspace_task_trees
for all
to anon, authenticated
using (true)
with check (true);

create policy "Allow all operations for workspace_verifier_reviews"
on public.workspace_verifier_reviews
for all
to anon, authenticated
using (true)
with check (true);

create policy "Allow all operations for workspace_plan_reviews"
on public.workspace_plan_reviews
for all
to anon, authenticated
using (true)
with check (true);

create policy "Allow all operations for workspace_circuit_breaker_events"
on public.workspace_circuit_breaker_events
for all
to anon, authenticated
using (true)
with check (true);

create policy "Allow all operations for workspace_knowledge_graphs"
on public.workspace_knowledge_graphs
for all
to anon, authenticated
using (true)
with check (true);

create policy "Allow all operations for workspace_tool_drafts"
on public.workspace_tool_drafts
for all
to anon, authenticated
using (true)
with check (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_dispatcher_decisions'
  ) then
    alter publication supabase_realtime add table public.workspace_dispatcher_decisions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_context_packages'
  ) then
    alter publication supabase_realtime add table public.workspace_context_packages;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_task_trees'
  ) then
    alter publication supabase_realtime add table public.workspace_task_trees;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_verifier_reviews'
  ) then
    alter publication supabase_realtime add table public.workspace_verifier_reviews;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_plan_reviews'
  ) then
    alter publication supabase_realtime add table public.workspace_plan_reviews;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_circuit_breaker_events'
  ) then
    alter publication supabase_realtime add table public.workspace_circuit_breaker_events;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_knowledge_graphs'
  ) then
    alter publication supabase_realtime add table public.workspace_knowledge_graphs;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_tool_drafts'
  ) then
    alter publication supabase_realtime add table public.workspace_tool_drafts;
  end if;
end $$;
