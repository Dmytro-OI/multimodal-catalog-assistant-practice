create table if not exists public.assistant_updates (
  update_id bigint primary key,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_until timestamptz,
  created_at timestamptz not null default now()
);
alter table public.assistant_updates enable row level security;
revoke all on public.assistant_updates from anon, authenticated;
grant all on public.assistant_updates to service_role;

create or replace function public.claim_assistant_update(probe_only boolean default false)
returns setof public.assistant_updates
language plpgsql security definer set search_path = public
as $$
begin
  if probe_only then return; end if;
  return query
  update public.assistant_updates u
  set status = 'processing', attempts = u.attempts + 1,
      lease_until = now() + interval '10 minutes'
  where u.update_id = (
    select q.update_id from public.assistant_updates q
    where (q.status = 'pending' and q.available_at <= now())
       or (q.status = 'processing' and q.lease_until < now())
    order by q.update_id
    for update skip locked limit 1
  ) returning u.*;
end;
$$;
revoke all on function public.claim_assistant_update(boolean) from public, anon, authenticated;
grant execute on function public.claim_assistant_update(boolean) to service_role;
