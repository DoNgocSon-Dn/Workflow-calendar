-- Bình chọn (poll) trong chat nhóm — câu hỏi + nhiều lựa chọn, cho phép chọn
-- nhiều / ẩn danh / đóng bình chọn.
--
-- Mỗi poll gắn với một tin nhắn (group_messages.poll_id) để hiện thành một
-- "thẻ poll" trong dòng chat. 3 RPC list/edit/delete phải trả thêm poll_id →
-- drop rồi tạo lại (kế thừa 46).
--
-- Chạy 1 lần trong Supabase SQL Editor, SAU 46_group_message_forward.sql.
-- An toàn khi chạy lại.

-- 1. Bảng ------------------------------------------------------------------
create table if not exists public.group_polls (
  id             uuid primary key default gen_random_uuid(),
  group_id       uuid not null references public.groups(id) on delete cascade,
  question       text not null,
  allow_multiple boolean not null default false,
  anonymous      boolean not null default false,
  closed_at      timestamptz,
  created_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now()
);

create table if not exists public.group_poll_options (
  id       uuid primary key default gen_random_uuid(),
  poll_id  uuid not null references public.group_polls(id) on delete cascade,
  text     text not null,
  sort     int  not null default 0
);
create index if not exists group_poll_options_poll_idx on public.group_poll_options (poll_id);

create table if not exists public.group_poll_votes (
  poll_id   uuid not null references public.group_polls(id) on delete cascade,
  option_id uuid not null references public.group_poll_options(id) on delete cascade,
  user_id   uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (option_id, user_id)
);
create index if not exists group_poll_votes_poll_idx on public.group_poll_votes (poll_id);

alter table public.group_messages add column if not exists poll_id uuid references public.group_polls(id) on delete set null;

alter table public.group_polls        enable row level security;
alter table public.group_poll_options enable row level security;
alter table public.group_poll_votes   enable row level security;

-- 2. RLS: đọc nếu là thành viên nhóm; vote/gỡ vote hàng của chính mình -------
drop policy if exists gp_select on public.group_polls;
create policy gp_select on public.group_polls
  for select using (public.is_group_member(group_id, auth.uid()));

drop policy if exists gpo_select on public.group_poll_options;
create policy gpo_select on public.group_poll_options
  for select using (
    exists (select 1 from public.group_polls p
            where p.id = group_poll_options.poll_id
              and public.is_group_member(p.group_id, auth.uid()))
  );

drop policy if exists gpv_select on public.group_poll_votes;
create policy gpv_select on public.group_poll_votes
  for select using (
    exists (select 1 from public.group_polls p
            where p.id = group_poll_votes.poll_id
              and public.is_group_member(p.group_id, auth.uid()))
  );

drop policy if exists gpv_write on public.group_poll_votes;
create policy gpv_write on public.group_poll_votes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Realtime (kênh dự phòng).
do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'group_poll_votes') then
    alter publication supabase_realtime add table public.group_poll_votes;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and tablename = 'group_polls') then
    alter publication supabase_realtime add table public.group_polls;
  end if;
end $$;

-- 3. RPC: chi tiết một poll (đếm phiếu + phiếu của mình + người vote nếu công khai) --
create or replace function public.get_group_poll(p_poll_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  poll public.group_polls;
  result jsonb;
begin
  select * into poll from public.group_polls where id = p_poll_id;
  if not found then raise exception 'poll not found'; end if;
  if not public.is_group_member(poll.group_id, auth.uid()) then
    raise exception 'not authorized';
  end if;

  select jsonb_build_object(
    'id', poll.id,
    'groupId', poll.group_id,
    'question', poll.question,
    'allowMultiple', poll.allow_multiple,
    'anonymous', poll.anonymous,
    'closedAt', poll.closed_at,
    'createdBy', poll.created_by,
    'myOptionIds', coalesce((
      select jsonb_agg(v.option_id)
      from public.group_poll_votes v
      where v.poll_id = poll.id and v.user_id = auth.uid()
    ), '[]'::jsonb),
    'options', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'text', o.text,
        'count', (select count(*) from public.group_poll_votes v where v.option_id = o.id),
        'voterIds', case when poll.anonymous then '[]'::jsonb else coalesce((
          select jsonb_agg(v.user_id order by v.created_at)
          from public.group_poll_votes v where v.option_id = o.id
        ), '[]'::jsonb) end
      ) order by o.sort, o.id)
      from public.group_poll_options o where o.poll_id = poll.id
    ), '[]'::jsonb)
  ) into result;

  return result;
end;
$$;

-- 4. RPC: bỏ phiếu (thay toàn bộ phiếu của mình trong poll này) --------------
create or replace function public.vote_group_poll(p_poll_id uuid, p_option_ids uuid[])
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  poll public.group_polls;
  n_valid int;
begin
  select * into poll from public.group_polls where id = p_poll_id;
  if not found then raise exception 'poll not found'; end if;
  if not public.is_group_member(poll.group_id, auth.uid()) then
    raise exception 'not authorized';
  end if;
  if poll.closed_at is not null then raise exception 'poll closed'; end if;

  if array_length(p_option_ids, 1) is null then
    delete from public.group_poll_votes where poll_id = p_poll_id and user_id = auth.uid();
    return;
  end if;

  if not poll.allow_multiple and array_length(p_option_ids, 1) > 1 then
    raise exception 'single choice only';
  end if;

  select count(*) into n_valid from public.group_poll_options
  where poll_id = p_poll_id and id = any(p_option_ids);
  if n_valid <> array_length(p_option_ids, 1) then
    raise exception 'invalid option';
  end if;

  delete from public.group_poll_votes where poll_id = p_poll_id and user_id = auth.uid();
  insert into public.group_poll_votes (poll_id, option_id, user_id)
  select p_poll_id, unnest(p_option_ids), auth.uid();
end;
$$;

-- 5. RPC: đóng bình chọn (người tạo hoặc LEADER/ADMIN) ----------------------
create or replace function public.close_group_poll(p_poll_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  poll public.group_polls;
begin
  select * into poll from public.group_polls where id = p_poll_id;
  if not found then raise exception 'poll not found'; end if;
  if poll.created_by <> auth.uid()
     and public.group_role_rank(public.group_role_of(poll.group_id, auth.uid()))
         < public.group_role_rank('admin') then
    raise exception 'not authorized';
  end if;
  update public.group_polls set closed_at = now() where id = p_poll_id and closed_at is null;
end;
$$;

revoke execute on function public.get_group_poll(uuid) from anon;
revoke execute on function public.vote_group_poll(uuid, uuid[]) from anon;
revoke execute on function public.close_group_poll(uuid) from anon;

-- 6. list_group_messages / edit / delete — thêm poll_id (kế thừa 46) --------
drop function if exists public.list_group_messages(uuid);
drop function if exists public.edit_group_message(uuid, text);
drop function if exists public.delete_group_message(uuid);

create or replace function public.list_group_messages(p_group_id uuid)
returns table (
  id uuid, group_id uuid, sender_id uuid, message text, created_at timestamptz,
  edited_at timestamptz, deleted_at timestamptz,
  attachment_url text, attachment_name text, attachment_type text, attachment_size bigint,
  sender_email text, sender_name text, mentions jsonb,
  reply_to_id uuid, reply_preview text, reply_sender_name text, reply_deleted boolean,
  pinned_at timestamptz, pinned_by uuid, forwarded_from_group text, poll_id uuid
)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
    select gmsg.id, gmsg.group_id, gmsg.sender_id, gmsg.message, gmsg.created_at,
           gmsg.edited_at, gmsg.deleted_at,
           gmsg.attachment_url, gmsg.attachment_name, gmsg.attachment_type, gmsg.attachment_size,
           u.email::text, u.raw_user_meta_data->>'full_name', gmsg.mentions,
           gmsg.reply_to_id, public._reply_preview(r),
           coalesce(ru.raw_user_meta_data->>'full_name', split_part(ru.email::text, '@', 1)),
           (r.id is not null and r.deleted_at is not null),
           gmsg.pinned_at, gmsg.pinned_by, gmsg.forwarded_from_group, gmsg.poll_id
    from public.group_messages gmsg
    join auth.users u on u.id = gmsg.sender_id
    left join public.group_messages r on r.id = gmsg.reply_to_id
    left join auth.users ru on ru.id = r.sender_id
    where gmsg.group_id = p_group_id
    order by gmsg.created_at asc;
end;
$$;

create or replace function public.edit_group_message(p_message_id uuid, p_message text)
returns table (
  id uuid, group_id uuid, sender_id uuid, message text, created_at timestamptz,
  edited_at timestamptz, deleted_at timestamptz,
  attachment_url text, attachment_name text, attachment_type text, attachment_size bigint,
  sender_email text, sender_name text, mentions jsonb,
  reply_to_id uuid, reply_preview text, reply_sender_name text, reply_deleted boolean,
  pinned_at timestamptz, pinned_by uuid, forwarded_from_group text, poll_id uuid
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_sender uuid;
  v_deleted timestamptz;
begin
  select gmsg.sender_id, gmsg.deleted_at into v_sender, v_deleted
  from public.group_messages gmsg where gmsg.id = p_message_id;
  if v_sender is null then raise exception 'message not found'; end if;
  if v_sender <> auth.uid() then raise exception 'not authorized'; end if;
  if v_deleted is not null then raise exception 'message already deleted'; end if;
  if p_message is null or length(trim(p_message)) = 0 then
    raise exception 'message must not be empty';
  end if;

  update public.group_messages gmsg
  set message = p_message, edited_at = now()
  where gmsg.id = p_message_id;

  return query
    select gmsg.id, gmsg.group_id, gmsg.sender_id, gmsg.message, gmsg.created_at,
           gmsg.edited_at, gmsg.deleted_at,
           gmsg.attachment_url, gmsg.attachment_name, gmsg.attachment_type, gmsg.attachment_size,
           u.email::text, u.raw_user_meta_data->>'full_name', gmsg.mentions,
           gmsg.reply_to_id, public._reply_preview(r),
           coalesce(ru.raw_user_meta_data->>'full_name', split_part(ru.email::text, '@', 1)),
           (r.id is not null and r.deleted_at is not null),
           gmsg.pinned_at, gmsg.pinned_by, gmsg.forwarded_from_group, gmsg.poll_id
    from public.group_messages gmsg
    join auth.users u on u.id = gmsg.sender_id
    left join public.group_messages r on r.id = gmsg.reply_to_id
    left join auth.users ru on ru.id = r.sender_id
    where gmsg.id = p_message_id;
end;
$$;

create or replace function public.delete_group_message(p_message_id uuid)
returns table (
  id uuid, group_id uuid, sender_id uuid, message text, created_at timestamptz,
  edited_at timestamptz, deleted_at timestamptz,
  attachment_url text, attachment_name text, attachment_type text, attachment_size bigint,
  sender_email text, sender_name text, mentions jsonb,
  reply_to_id uuid, reply_preview text, reply_sender_name text, reply_deleted boolean,
  pinned_at timestamptz, pinned_by uuid, forwarded_from_group text, poll_id uuid
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_group_id uuid;
  v_sender uuid;
begin
  select gmsg.group_id, gmsg.sender_id into v_group_id, v_sender
  from public.group_messages gmsg where gmsg.id = p_message_id;
  if v_group_id is null then raise exception 'message not found'; end if;
  if v_sender <> auth.uid()
     and public.group_role_rank(public.group_role_of(v_group_id, auth.uid()))
         < public.group_role_rank('admin') then
    raise exception 'not authorized';
  end if;

  update public.group_messages gmsg
  set deleted_at = now(), message = null, mentions = null, reply_to_id = null,
      pinned_at = null, pinned_by = null, forwarded_from_group = null,
      attachment_url = null, attachment_name = null, attachment_type = null, attachment_size = null
  where gmsg.id = p_message_id;

  return query
    select gmsg.id, gmsg.group_id, gmsg.sender_id, gmsg.message, gmsg.created_at,
           gmsg.edited_at, gmsg.deleted_at,
           gmsg.attachment_url, gmsg.attachment_name, gmsg.attachment_type, gmsg.attachment_size,
           u.email::text, u.raw_user_meta_data->>'full_name', gmsg.mentions,
           gmsg.reply_to_id, public._reply_preview(r),
           coalesce(ru.raw_user_meta_data->>'full_name', split_part(ru.email::text, '@', 1)),
           (r.id is not null and r.deleted_at is not null),
           gmsg.pinned_at, gmsg.pinned_by, gmsg.forwarded_from_group, gmsg.poll_id
    from public.group_messages gmsg
    join auth.users u on u.id = gmsg.sender_id
    left join public.group_messages r on r.id = gmsg.reply_to_id
    left join auth.users ru on ru.id = r.sender_id
    where gmsg.id = p_message_id;
end;
$$;

revoke execute on function public.list_group_messages(uuid) from anon;
revoke execute on function public.edit_group_message(uuid, text) from anon;
revoke execute on function public.delete_group_message(uuid) from anon;
