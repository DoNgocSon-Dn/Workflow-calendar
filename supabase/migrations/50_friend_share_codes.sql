-- Private, randomly generated friend codes. A code requests friendship; it never grants access.
begin;
create table if not exists public.social_friend_codes (
  user_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check(code ~ '^[A-F0-9]{12}$'),
  created_at timestamptz not null default now()
);
alter table public.social_friend_codes enable row level security;
revoke all on public.social_friend_codes from public,anon,authenticated;
grant select on public.social_friend_codes to authenticated;
drop policy if exists social_friend_codes_read_own on public.social_friend_codes;
create policy social_friend_codes_read_own on public.social_friend_codes for select to authenticated using(user_id=auth.uid());

create or replace function public.social_my_friend_code() returns text
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); value text; attempt integer;
begin
  if me is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select code into value from public.social_friend_codes where user_id=me;
  if value is null then
    for attempt in 1..10 loop
      begin
        insert into public.social_friend_codes(user_id,code)
        values(me,upper(substr(replace(gen_random_uuid()::text,'-',''),1,12)))
        on conflict(user_id) do update set user_id=excluded.user_id
        returning code into value;
        exit;
      exception when unique_violation then
        if attempt=10 then raise; end if;
      end;
    end loop;
  end if;
  return 'WF-' || substr(value,1,4) || '-' || substr(value,5,4) || '-' || substr(value,9,4);
end $$;

create or replace function public.social_request_friend_code(p_code text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare value text; peer_email text;
begin
  if auth.uid() is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_code is null or length(p_code)>32 then raise exception 'Invalid friend code' using errcode='22023'; end if;
  value:=regexp_replace(upper(trim(p_code)),'[-[:space:]]','','g');
  if left(value,2)='WF' then value:=substr(value,3); end if;
  if value !~ '^[A-F0-9]{12}$' then raise exception 'Invalid friend code' using errcode='22023'; end if;
  select u.email into peer_email from public.social_friend_codes c join auth.users u on u.id=c.user_id where c.code=value;
  if peer_email is null then raise exception 'Account is unavailable' using errcode='P0002'; end if;
  -- Reuse the existing pair lock, self/block checks and idempotent request flow.
  return public.social_request_friend(peer_email);
end $$;
revoke all on function public.social_my_friend_code(),public.social_request_friend_code(text) from public,anon;
grant execute on function public.social_my_friend_code(),public.social_request_friend_code(text) to authenticated;
commit;
