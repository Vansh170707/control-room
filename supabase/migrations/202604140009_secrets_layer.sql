create table if not exists public.workspace_secrets (
  id text primary key,
  workspace_id text not null default 'default',
  agent_id text,
  provider text not null,
  label text not null,
  key_preview text not null,
  encrypted_key text not null,
  status text not null default 'active' check (status in ('active', 'expired', 'invalid', 'unconfigured', 'refreshing')),
  scopes jsonb not null default '[]'::jsonb,
  is_oauth boolean not null default false,
  expires_at timestamptz,
  last_validated_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspace_secrets_workspace_id_idx
on public.workspace_secrets (workspace_id, provider);

create index if not exists workspace_secrets_agent_id_idx
on public.workspace_secrets (agent_id);

create table if not exists public.workspace_agent_bindings (
  agent_id text not null,
  provider text not null,
  secret_id text not null,
  model text not null default '',
  is_default boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  primary key (agent_id, provider)
);

create table if not exists public.workspace_agent_variables (
  agent_id text not null,
  key text not null,
  value text not null,
  is_secret boolean not null default false,
  description text not null default '',
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (agent_id, key)
);

alter table public.workspace_secrets enable row level security;
alter table public.workspace_agent_bindings enable row level security;
alter table public.workspace_agent_variables enable row level security;

create policy "Allow all operations for workspace_secrets"
on public.workspace_secrets for all to anon, authenticated using (true) with check (true);

create policy "Allow all operations for workspace_agent_bindings"
on public.workspace_agent_bindings for all to anon, authenticated using (true) with check (true);

create policy "Allow all operations for workspace_agent_variables"
on public.workspace_agent_variables for all to anon, authenticated using (true) with check (true);

alter publication supabase_realtime add table public.workspace_secrets;
alter publication supabase_realtime add table public.workspace_agent_bindings;
alter publication supabase_realtime add table public.workspace_agent_variables;

drop trigger if exists set_workspace_secrets_updated_at on public.workspace_secrets;
create trigger set_workspace_secrets_updated_at
before update on public.workspace_secrets
for each row execute function public.set_updated_at();
