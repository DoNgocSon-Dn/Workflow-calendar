-- Additive: friendship requests, blocking and private 1:1 text messages.
-- All writes go through narrowly scoped RPCs using auth.uid(); no service key in clients.
begin;
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(requester_id <> recipient_id)
);
create unique index if not exists friend_requests_pair_uidx on public.friend_requests
  (least(requester_id,recipient_id), greatest(requester_id,recipient_id));
create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(blocker_id,blocked_id),
  check(blocker_id <> blocked_id)
);
create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null, body text not null check(length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now(), read_at timestamptz,
  check(sender_id <> recipient_id), unique(sender_id,client_id)
);
create index if not exists direct_messages_pair_page_idx on public.direct_messages
  (least(sender_id,recipient_id),greatest(sender_id,recipient_id),created_at desc,id desc);
create index if not exists direct_messages_unread_idx on public.direct_messages(recipient_id,sender_id)
  where read_at is null;
alter table public.friend_requests enable row level security;
alter table public.user_blocks enable row level security;
alter table public.direct_messages enable row level security;
drop policy if exists friend_requests_read_own on public.friend_requests;
create policy friend_requests_read_own on public.friend_requests for select to authenticated
  using(auth.uid() in (requester_id,recipient_id));
drop policy if exists user_blocks_read_own on public.user_blocks;
create policy user_blocks_read_own on public.user_blocks for select to authenticated using(blocker_id=auth.uid());
drop policy if exists direct_messages_read_own on public.direct_messages;
create policy direct_messages_read_own on public.direct_messages for select to authenticated
  using(auth.uid() in (sender_id,recipient_id));
revoke all on public.friend_requests,public.user_blocks,public.direct_messages from public,anon,authenticated;
grant select on public.friend_requests,public.user_blocks,public.direct_messages to authenticated;

create or replace function public.social_profile(p_id uuid) returns jsonb
language sql stable security definer set search_path=public,pg_temp as $$
  select jsonb_build_object('id',id,'name',coalesce(nullif(raw_user_meta_data->>'full_name',''),split_part(email,'@',1)),
    'email',email,'avatarUrl',raw_user_meta_data->>'avatar_url') from auth.users where id=p_id;
$$;
create or replace function public.social_pair_blocked(a uuid,b uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
  select exists(select 1 from public.user_blocks where (blocker_id=a and blocked_id=b) or (blocker_id=b and blocked_id=a));
$$;
create or replace function public.social_pair_lock(a uuid,b uuid) returns void
language sql security definer set search_path=public,pg_temp as $$
  select pg_advisory_xact_lock(hashtextextended(least(a,b)::text || greatest(a,b)::text,0));
$$;
create or replace function public.social_message_json(m public.direct_messages) returns jsonb
language sql immutable as $$
  select jsonb_build_object('id',m.id,'senderId',m.sender_id,'recipientId',m.recipient_id,
    'clientId',m.client_id,'body',m.body,'createdAt',m.created_at,'readAt',m.read_at);
$$;
revoke all on function public.social_profile(uuid),public.social_pair_blocked(uuid,uuid),
 public.social_pair_lock(uuid,uuid),public.social_message_json(public.direct_messages) from public,anon,authenticated;

create or replace function public.social_request_friend(p_email text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); peer uuid; r public.friend_requests;
begin
  if me is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if length(trim(p_email)) not between 3 and 254 then raise exception 'Invalid email' using errcode='22023'; end if;
  select id into peer from auth.users where lower(email)=lower(trim(p_email));
  if peer is null or peer=me then raise exception 'Account is unavailable' using errcode='P0002'; end if;
  perform public.social_pair_lock(me,peer);
  if public.social_pair_blocked(me,peer) then raise exception 'Account is unavailable' using errcode='P0002'; end if;
  select * into r from public.friend_requests where least(requester_id,recipient_id)=least(me,peer)
    and greatest(requester_id,recipient_id)=greatest(me,peer) for update;
  if found then
    if r.status='declined' then
      update public.friend_requests set requester_id=me,recipient_id=peer,status='pending',updated_at=now() where id=r.id returning * into r;
    end if;
  else
    insert into public.friend_requests(requester_id,recipient_id) values(me,peer) returning * into r;
  end if;
  return jsonb_build_object('id',r.id,'requesterId',r.requester_id,'recipientId',r.recipient_id,'status',r.status);
end $$;

create or replace function public.social_friend_action(p_id uuid,p_action text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); r public.friend_requests; peer uuid;
begin
  if me is null then raise exception 'Sign in required' using errcode='42501'; end if;
  select * into r from public.friend_requests where id=p_id and me in (requester_id,recipient_id);
  if not found then raise exception 'Request not found' using errcode='P0002'; end if;
  peer:=case when r.requester_id=me then r.recipient_id else r.requester_id end;
  perform public.social_pair_lock(me,peer);
  select * into r from public.friend_requests where id=p_id for update;
  if not found then raise exception 'Request not found' using errcode='P0002'; end if;
  if p_action in ('accept','decline') and r.recipient_id=me and r.status='pending' then
    if public.social_pair_blocked(me,peer) then raise exception 'Account is unavailable' using errcode='42501'; end if;
    update public.friend_requests set status=case p_action when 'accept' then 'accepted' else 'declined' end,
      updated_at=now() where id=p_id;
  elsif (p_action='cancel' and r.requester_id=me and r.status='pending')
     or (p_action='remove' and r.status='accepted') then
    delete from public.friend_requests where id=p_id;
  else raise exception 'Action not permitted' using errcode='42501'; end if;
  return jsonb_build_object('peerId',peer,'action',p_action);
end $$;

create or replace function public.social_block(p_peer uuid,p_block boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid();
begin
  if me is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_peer=me or not exists(select 1 from auth.users where id=p_peer) then raise exception 'Invalid account' using errcode='22023'; end if;
  perform public.social_pair_lock(me,p_peer);
  if p_block then
    insert into public.user_blocks(blocker_id,blocked_id) values(me,p_peer) on conflict do nothing;
    delete from public.friend_requests where least(requester_id,recipient_id)=least(me,p_peer)
      and greatest(requester_id,recipient_id)=greatest(me,p_peer);
  else delete from public.user_blocks where blocker_id=me and blocked_id=p_peer; end if;
  return jsonb_build_object('peerId',p_peer,'blocked',p_block);
end $$;

create or replace function public.social_send_message(p_peer uuid,p_client uuid,p_body text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); m public.direct_messages;
begin
  if me is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_peer is null or p_peer=me or p_client is null or p_body is null or length(btrim(p_body)) not between 1 and 4000 then
    raise exception 'Invalid message' using errcode='22023'; end if;
  perform public.social_pair_lock(me,p_peer);
  select * into m from public.direct_messages where sender_id=me and client_id=p_client;
  if found then
    if m.recipient_id<>p_peer or m.body<>btrim(p_body) then raise exception 'Message key already used' using errcode='22023'; end if;
    return jsonb_build_object('message',public.social_message_json(m),'created',false);
  end if;
  if public.social_pair_blocked(me,p_peer) or not exists(select 1 from public.friend_requests where status='accepted'
    and least(requester_id,recipient_id)=least(me,p_peer) and greatest(requester_id,recipient_id)=greatest(me,p_peer)) then
    raise exception 'Become friends before messaging' using errcode='42501'; end if;
  insert into public.direct_messages(sender_id,recipient_id,client_id,body)
    values(me,p_peer,p_client,btrim(p_body)) returning * into m;
  return jsonb_build_object('message',public.social_message_json(m),'created',true);
end $$;

create or replace function public.social_messages(p_peer uuid,p_before uuid default null,p_limit integer default 50) returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); cursor_time timestamptz; result jsonb; has_more boolean; page_size integer:=least(greatest(coalesce(p_limit,50),1),50);
begin
  if me is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_peer is null or p_peer=me then raise exception 'Invalid account' using errcode='22023'; end if;
  if p_before is not null then
    select created_at into cursor_time from public.direct_messages where id=p_before
      and ((sender_id=me and recipient_id=p_peer) or (sender_id=p_peer and recipient_id=me));
    if not found then raise exception 'Invalid message cursor' using errcode='22023'; end if;
  end if;
  with candidates as (select * from public.direct_messages
    where ((sender_id=me and recipient_id=p_peer) or (sender_id=p_peer and recipient_id=me))
      and (p_before is null or (created_at,id)<(cursor_time,p_before))
    order by created_at desc,id desc limit page_size+1),
  page as (select * from candidates order by created_at desc,id desc limit page_size)
  select coalesce((select jsonb_agg(public.social_message_json(row(id,sender_id,recipient_id,client_id,body,created_at,read_at)::public.direct_messages) order by created_at,id) from page),'[]'::jsonb),
    (select count(*)>page_size from candidates) into result,has_more;
  return jsonb_build_object('messages',result,'hasMore',has_more);
end $$;

create or replace function public.social_mark_read(p_ids uuid[]) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); ids uuid[];
begin
  if me is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if p_ids is null or cardinality(p_ids)>100 then raise exception 'Invalid message IDs' using errcode='22023'; end if;
  with changed as(update public.direct_messages set read_at=now() where id=any(p_ids) and recipient_id=me and read_at is null returning id)
    select coalesce(array_agg(id),'{}'::uuid[]) into ids from changed;
  return to_jsonb(ids);
end $$;

create or replace function public.social_overview() returns jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare me uuid:=auth.uid(); result jsonb;
begin
  if me is null then raise exception 'Sign in required' using errcode='42501'; end if;
  with relations as (select r.*,case when requester_id=me then recipient_id else requester_id end peer
    from public.friend_requests r where me in(requester_id,recipient_id)),
  peers as (select peer from relations where status='accepted'
    union select case when sender_id=me then recipient_id else sender_id end from public.direct_messages where me in(sender_id,recipient_id)
    union select blocked_id from public.user_blocks where blocker_id=me),
  conversations as(select p.peer,
    (select public.social_message_json(m) from public.direct_messages m where
      (m.sender_id=me and m.recipient_id=p.peer) or (m.sender_id=p.peer and m.recipient_id=me)
      order by m.created_at desc,m.id desc limit 1) last_message,
    (select count(*) from public.direct_messages where sender_id=p.peer and recipient_id=me and read_at is null) unread_count,
    exists(select 1 from relations where peer=p.peer and status='accepted') and not public.social_pair_blocked(me,p.peer) can_message,
    exists(select 1 from public.user_blocks where blocker_id=me and blocked_id=p.peer) blocked_by_me from peers p)
  select jsonb_build_object(
    'friends',coalesce((select jsonb_agg(jsonb_build_object('id',id,'profile',public.social_profile(peer)) order by updated_at desc) from relations where status='accepted'),'[]'::jsonb),
    'incoming',coalesce((select jsonb_agg(jsonb_build_object('id',id,'profile',public.social_profile(peer)) order by created_at desc) from relations where status='pending' and recipient_id=me),'[]'::jsonb),
    'outgoing',coalesce((select jsonb_agg(jsonb_build_object('id',id,'profile',public.social_profile(peer)) order by created_at desc) from relations where status='pending' and requester_id=me),'[]'::jsonb),
    'conversations',coalesce((select jsonb_agg(jsonb_build_object('profile',public.social_profile(peer),'lastMessage',last_message,
      'unreadCount',unread_count,'canMessage',can_message,'blockedByMe',blocked_by_me) order by (last_message->>'createdAt') desc nulls last,peer) from conversations),'[]'::jsonb)
  ) into result;
  return result;
end $$;

revoke all on function public.social_request_friend(text),public.social_friend_action(uuid,text),
 public.social_block(uuid,boolean),public.social_send_message(uuid,uuid,text),
 public.social_messages(uuid,uuid,integer),public.social_mark_read(uuid[]),public.social_overview() from public,anon;
grant execute on function public.social_request_friend(text),public.social_friend_action(uuid,text),
 public.social_block(uuid,boolean),public.social_send_message(uuid,uuid,text),
 public.social_messages(uuid,uuid,integer),public.social_mark_read(uuid[]),public.social_overview() to authenticated;
commit;
