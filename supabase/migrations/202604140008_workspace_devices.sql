create table if not exists public.workspace_devices (
  id text primary key,
  workspace_id text not null default 'default',
  name text not null,
  path text not null,
  status text not null default 'stopped' check (status in ('starting', 'running', 'stopped', 'error', 'creating')),
  created_at timestamptz not null default timezone('utc', now()),
  last_started_at timestamptz,
  last_stopped_at timestamptz,
  ports jsonb not null default '[]'::jsonb,
  installed_packages jsonb not null default '[]'::jsonb,
  environment_variables jsonb not null default '{}'::jsonb,
  disk_usage_bytes bigint not null default 0,
  disk_limit_bytes bigint not null default 500000000,
  runtime jsonb not null default '{}'::jsonb,
  sessions jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspace_devices_workspace_id_idx
on public.workspace_devices (workspace_id, updated_at desc);

create index if not exists workspace_devices_path_idx
on public.workspace_devices (path);

drop trigger if exists set_workspace_devices_updated_at on public.workspace_devices;
create trigger set_workspace_devices_updated_at
before update on public.workspace_devices
for each row
execute function public.set_updated_at();

alter table public.workspace_devices enable row level security;

create policy "Allow all operations for workspace_devices"
on public.workspace_devices
for all
to anon, authenticated
using (true)
with check (true);

alter publication supabase_realtime add table public.workspace_devices;
