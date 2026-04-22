create or replace function public.claim_next_agent_command(p_agent_id text)
returns public.agent_commands
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed_command public.agent_commands;
begin
  with next_command as (
    select id
    from public.agent_commands
    where agent_id = p_agent_id
      and status = 'pending'
    order by created_at asc
    for update skip locked
    limit 1
  )
  update public.agent_commands as command_row
  set
    status = 'dispatched',
    updated_at = timezone('utc', now())
  from next_command
  where command_row.id = next_command.id
  returning command_row.* into claimed_command;

  return claimed_command;
end;
$$;

revoke all on function public.claim_next_agent_command(text) from public, anon, authenticated;
grant execute on function public.claim_next_agent_command(text) to service_role;
