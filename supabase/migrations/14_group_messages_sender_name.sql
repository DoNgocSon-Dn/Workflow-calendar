-- Chat nhóm chỉ hiển thị được email người gửi (list_group_messages /
-- edit_group_message / delete_group_message chỉ select u.email), trong khi
-- tên hiển thị (đặt ở Cài đặt tài khoản, lưu vào auth.users.raw_user_meta_data
-- ->> 'full_name') đã tồn tại sẵn cho chính user đang đăng nhập — chỉ chưa lộ
-- ra qua 3 RPC này cho CÁC THÀNH VIÊN KHÁC trong nhóm.
--
-- Thêm cột sender_name vào cả 3 hàm. Kiểu hàng trả về (OUT parameters) đổi
-- nên create or replace KHÔNG đủ — Postgres báo lỗi 42P13 "cannot change
-- return type of existing function" — phải drop trước.
--
-- Chạy 1 lần trong Supabase SQL Editor, sau 04_group_chat_enhancements.sql.

drop function if exists public.list_group_messages(uuid);
drop function if exists public.edit_group_message(uuid, text);
drop function if exists public.delete_group_message(uuid);

create or replace function public.list_group_messages(p_group_id uuid)
returns table (
  id uuid, group_id uuid, sender_id uuid, message text, created_at timestamptz,
  edited_at timestamptz, deleted_at timestamptz,
  attachment_url text, attachment_name text, attachment_type text, attachment_size bigint,
  sender_email text, sender_name text
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
           u.email::text, u.raw_user_meta_data->>'full_name'
    from public.group_messages gmsg
    join auth.users u on u.id = gmsg.sender_id
    where gmsg.group_id = p_group_id
    order by gmsg.created_at asc;
end;
$$;

create or replace function public.edit_group_message(p_message_id uuid, p_message text)
returns table (
  id uuid, group_id uuid, sender_id uuid, message text, created_at timestamptz,
  edited_at timestamptz, deleted_at timestamptz,
  attachment_url text, attachment_name text, attachment_type text, attachment_size bigint,
  sender_email text, sender_name text
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

  if v_sender is null then
    raise exception 'message not found';
  end if;
  if v_sender <> auth.uid() then
    raise exception 'not authorized';
  end if;
  if v_deleted is not null then
    raise exception 'message already deleted';
  end if;
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
           u.email::text, u.raw_user_meta_data->>'full_name'
    from public.group_messages gmsg
    join auth.users u on u.id = gmsg.sender_id
    where gmsg.id = p_message_id;
end;
$$;

create or replace function public.delete_group_message(p_message_id uuid)
returns table (
  id uuid, group_id uuid, sender_id uuid, message text, created_at timestamptz,
  edited_at timestamptz, deleted_at timestamptz,
  attachment_url text, attachment_name text, attachment_type text, attachment_size bigint,
  sender_email text, sender_name text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_group_id uuid;
  v_sender uuid;
  v_role text;
begin
  select gmsg.group_id, gmsg.sender_id into v_group_id, v_sender
  from public.group_messages gmsg where gmsg.id = p_message_id;

  if v_group_id is null then
    raise exception 'message not found';
  end if;

  if v_sender <> auth.uid() then
    select gm.role into v_role
    from public.group_members gm
    where gm.group_id = v_group_id and gm.user_id = auth.uid();

    if v_role is null or v_role not in ('owner', 'admin') then
      raise exception 'not authorized';
    end if;
  end if;

  update public.group_messages gmsg
  set deleted_at = now(), message = null,
      attachment_url = null, attachment_name = null, attachment_type = null, attachment_size = null
  where gmsg.id = p_message_id;

  return query
    select gmsg.id, gmsg.group_id, gmsg.sender_id, gmsg.message, gmsg.created_at,
           gmsg.edited_at, gmsg.deleted_at,
           gmsg.attachment_url, gmsg.attachment_name, gmsg.attachment_type, gmsg.attachment_size,
           u.email::text, u.raw_user_meta_data->>'full_name'
    from public.group_messages gmsg
    join auth.users u on u.id = gmsg.sender_id
    where gmsg.id = p_message_id;
end;
$$;
