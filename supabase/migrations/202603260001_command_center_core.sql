create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.agents (
  id text primary key,
  name text not null,
  emoji text not null default '🤖',
  subtitle text not null default '',
  type text not null,
  role text not null,
  accent text not null default '#10b981',
  status text not null default 'offline' check (status in ('active', 'idle', 'error', 'offline')),
  current_activity text not null default 'Standing by',
  last_seen timestamptz not null default timezone('utc', now()),
  tasks_completed integer not null default 0,
  accuracy numeric(5,2) not null default 0,
  skills jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.agent_events (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.agents(id) on delete cascade,
  action text not null,
  emoji text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.ai_logs (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.agents(id) on delete cascade,
  category text not null check (category in ('observation', 'general', 'reminder', 'fyi')),
  message text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.agent_commands (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references public.agents(id) on delete cascade,
  command text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'dispatched', 'running', 'completed', 'failed', 'canceled')),
  created_by text default 'dashboard',
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists agent_events_created_at_idx on public.agent_events (created_at desc);
create index if not exists ai_logs_created_at_idx on public.ai_logs (created_at desc);
create index if not exists agent_commands_agent_id_idx on public.agent_commands (agent_id, created_at desc);

drop trigger if exists set_agents_updated_at on public.agents;
create trigger set_agents_updated_at
before update on public.agents
for each row
execute function public.set_updated_at();

drop trigger if exists set_agent_commands_updated_at on public.agent_commands;
create trigger set_agent_commands_updated_at
before update on public.agent_commands
for each row
execute function public.set_updated_at();

alter table public.agents enable row level security;
alter table public.agent_events enable row level security;
alter table public.ai_logs enable row level security;
alter table public.agent_commands enable row level security;

create policy "Starter demo read agents"
on public.agents
for select
to anon, authenticated
using (true);

create policy "Starter demo read agent events"
on public.agent_events
for select
to anon, authenticated
using (true);

create policy "Starter demo read ai logs"
on public.ai_logs
for select
to anon, authenticated
using (true);

create policy "Starter demo update agents"
on public.agents
for update
to anon, authenticated
using (true)
with check (true);

alter publication supabase_realtime add table public.agents, public.agent_events, public.ai_logs;

insert into public.agents (
  id,
  name,
  emoji,
  subtitle,
  type,
  role,
  accent,
  status,
  current_activity,
  last_seen,
  tasks_completed,
  accuracy,
  skills
)
values
  (
    'alpha',
    'Agent Alpha',
    '🤖',
    'Primary systems orchestrator',
    'Code Agent',
    'Lead Engineer',
    '#10b981',
    'active',
    'Shipping command deck refinements',
    '2026-03-25T16:24:00Z',
    143,
    98.6,
    jsonb_build_array('React', 'TypeScript', 'System Design', 'Debugging')
  ),
  (
    'dispatch',
    'Dispatch Bot',
    '📋',
    'Routing work across the swarm',
    'Coordinator',
    'Operations Director',
    '#f59e0b',
    'idle',
    'Triaging cross-team requests',
    '2026-03-25T16:17:00Z',
    211,
    96.4,
    jsonb_build_array('Planning', 'Prioritization', 'Scheduling', 'Escalation')
  ),
  (
    'audit',
    'Audit Bot',
    '🛡️',
    'Quality, policy, and trust guardrails',
    'Quality Agent',
    'Compliance Officer',
    '#06b6d4',
    'active',
    'Reviewing release readiness',
    '2026-03-25T16:21:00Z',
    97,
    99.2,
    jsonb_build_array('QA', 'Risk Analysis', 'Monitoring', 'Compliance')
  )
on conflict (id) do update
set
  name = excluded.name,
  emoji = excluded.emoji,
  subtitle = excluded.subtitle,
  type = excluded.type,
  role = excluded.role,
  accent = excluded.accent,
  status = excluded.status,
  current_activity = excluded.current_activity,
  last_seen = excluded.last_seen,
  tasks_completed = excluded.tasks_completed,
  accuracy = excluded.accuracy,
  skills = excluded.skills;

insert into public.agent_events (agent_id, emoji, action, created_at)
values
  ('alpha', '🤖', 'completed the ClawBuddy launch build and opened a verification pass', '2026-03-25T16:24:00Z'),
  ('audit', '🛡️', 'flagged a permissions gap in the deployment checklist', '2026-03-25T16:16:00Z'),
  ('dispatch', '📋', 'rebalanced 3 tasks from backlog into the doing lane', '2026-03-25T15:58:00Z'),
  ('alpha', '🤖', 'generated a fresh council summary for the product launch debate', '2026-03-25T15:34:00Z'),
  ('dispatch', '📋', 'queued a follow-up sequence for high-intent demo leads', '2026-03-25T14:47:00Z'),
  ('audit', '🛡️', 'closed two stale warnings after reviewing evidence', '2026-03-25T13:52:00Z');

insert into public.ai_logs (agent_id, category, message, created_at)
values
  ('alpha', 'observation', 'Command deck hover latency dropped below 10ms after memoizing the chart props.', '2026-03-25T16:23:00Z'),
  ('dispatch', 'general', 'Launch operations board synced with the morning planning notes.', '2026-03-25T16:04:00Z'),
  ('audit', 'reminder', 'Privacy disclaimer still needs final wording before the demo is shared externally.', '2026-03-25T15:51:00Z'),
  ('alpha', 'fyi', 'Meeting intelligence cards now support paginated expansion without layout shift.', '2026-03-25T15:14:00Z'),
  ('dispatch', 'observation', 'Sales calls with external stakeholders averaged 18% longer than internal syncs this month.', '2026-03-25T14:56:00Z'),
  ('audit', 'general', 'Council session replay links were rotated and verified.', '2026-03-25T14:07:00Z'),
  ('alpha', 'reminder', 'Remember to snapshot the dashboard before adding customer-specific branding.', '2026-03-25T13:42:00Z'),
  ('dispatch', 'fyi', 'Three unread action-item exports are waiting in the integrations queue.', '2026-03-25T12:58:00Z'),
  ('audit', 'observation', 'No anomalies detected across the last eight meeting transcript imports.', '2026-03-25T11:25:00Z'),
  ('alpha', 'general', 'Agent profile dialog is ready for role and naming edits.', '2026-03-25T10:44:00Z');
