create table public.council_sessions (
    id uuid primary key default gen_random_uuid(),
    question text not null,
    status text not null default 'active' check (status in ('active', 'resolved', 'watching')),
    created_at timestamp with time zone default now() not null
);

create table public.council_messages (
    id uuid primary key default gen_random_uuid(),
    session_id uuid not null references public.council_sessions(id) on delete cascade,
    agent_id text not null references public.agents(id) on delete cascade,
    message_number integer generated always as identity,
    content text not null,
    created_at timestamp with time zone default now() not null
);

alter table public.council_sessions enable row level security;
alter table public.council_messages enable row level security;

-- Allow open access for internal dashboard usage
create policy "Allow all operations for council_sessions" 
on public.council_sessions 
for all 
using (true) 
with check (true);

create policy "Allow all operations for council_messages" 
on public.council_messages 
for all 
using (true) 
with check (true);

-- Enable realtime subscriptions
alter publication supabase_realtime add table public.council_sessions;
alter publication supabase_realtime add table public.council_messages;
