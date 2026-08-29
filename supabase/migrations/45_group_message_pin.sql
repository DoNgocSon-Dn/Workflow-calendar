-- Ghim tin nhắn quan trọng lên đầu khung chat (Trưởng/Phó nhóm).
--
-- Thêm `pinned_at` + `pinned_by` vào group_messages. 3 RPC list/edit/delete
-- phải trả thêm 2 cột → drop rồi tạo lại (kế thừa hình dạng từ 43_group_message_reply.sql).
--
-- Chạy 1 lần trong Supabase SQL Editor, SAU 43_group_message_reply.sql.
-- An toàn khi chạy lại.

alter table public.group_messages
  add column if not exists pinned_at  timestamptz,
  add column if not exists pinned_by  uuid references auth.users(id) on delete set null;

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
  pinned_at timestamptz, pinned_by uuid
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
           gmsg.pinned_at, gmsg.pinned_by
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
  pinned_at timestamptz, pinned_by uuid
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
           gmsg.pinned_at, gmsg.pinned_by
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
  pinned_at timestamptz, pinned_by uuid
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
      pinned_at = null, pinned_by = null,
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
           gmsg.pinned_at, gmsg.pinned_by
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
