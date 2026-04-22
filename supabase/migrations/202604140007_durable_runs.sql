alter table public.workspace_command_runs
  drop constraint if exists workspace_command_runs_status_check;

alter table public.workspace_command_runs
  add constraint workspace_command_runs_status_check
  check (status in ('queued', 'planning', 'running', 'waiting_for_approval', 'blocked', 'completed', 'failed', 'canceled'));

alter table public.workspace_command_runs
  add column if not exists retry_count integer not null default 0,
  add column if not exists max_retries integer not null default 3,
  add column if not exists parent_run_id text,
  add column if not exists retry_of_run_id text,
  add column if not exists model text,
  add column if not exists provider text,
  add column if not exists token_usage jsonb default '{}'::jsonb,
  add column if not exists tool_calls jsonb default '[]'::jsonb,
  add column if not exists artifacts jsonb default '[]'::jsonb,
  add column if not exists phase text not null default 'completed',
  add column if not exists queued_at timestamptz,
  add column if not exists planned_at timestamptz;

alter table public.workspace_command_runs
  add constraint workspace_command_runs_phase_check
  check (phase in ('queued', 'planning', 'executing', 'waiting_for_approval', 'blocked', 'completed', 'failed', 'canceled'));

create index if not exists workspace_command_runs_status_idx
on public.workspace_command_runs (status, created_at desc);

create index if not exists workspace_command_runs_parent_run_id_idx
on public.workspace_command_runs (parent_run_id)
where parent_run_id is not null;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'workspace_command_runs'
  ) then
    alter publication supabase_realtime add table public.workspace_command_runs;
  end if;
end $$;
