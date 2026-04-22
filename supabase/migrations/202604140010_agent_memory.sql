create table if not exists public.agent_memory (
  id text primary key,
  agent_id text not null,
  type text not null check (type in ('thread', 'note', 'variable', 'file_attachment', 'knowledge', 'summary')),
  key text not null,
  content text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  token_count integer,
  expires_at timestamptz,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists agent_memory_agent_id_idx
on public.agent_memory (agent_id, type, created_at desc);

create index if not exists agent_memory_agent_key_idx
on public.agent_memory (agent_id, key);

alter table public.agent_memory enable row level security;

create policy "Allow all operations for agent_memory"
on public.agent_memory for all to anon, authenticated using (true) with check (true);

alter publication supabase_realtime add table public.agent_memory;

drop trigger if exists set_agent_memory_updated_at on public.agent_memory;
create trigger set_agent_memory_updated_at
before update on public.agent_memory
for each row execute function public.set_updated_at();
