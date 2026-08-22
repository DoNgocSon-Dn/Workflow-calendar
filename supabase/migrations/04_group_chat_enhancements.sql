-- Migration: sửa/xoá tin nhắn (soft delete) + file đính kèm trong chat nhóm,
-- realtime cho task. Chạy 1 lần trong Supabase SQL Editor, SAU khi đã chạy
-- 02_groups_workspace.sql và 03_group_members_with_email.sql.

alter table public.group_messages
  add column if not exists edited_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists attachment_url text,
  add column if not exists attachment_name text,
  add column if not exists attachment_type text,
  add column if not exists attachment_size bigint;

-- Cho phép tin nhắn chỉ gồm file đính kèm (không có text).
alter table public.group_messages alter column message drop not null;

alter table public.group_messages drop constraint if exists group_messages_content_check;
alter table public.group_messages add constraint group_messages_content_check
  check (
    (message is not null and length(trim(message)) > 0) or attachment_url is not null
  );

-- Sửa/xoá tin nhắn đi qua RPC security definer (edit_group_message /
-- delete_group_message) để kiểm soát quyền chi tiết (sender tự sửa/xoá,
-- owner/admin chỉ được xoá). Policy "for all" cũ bị thay bằng
-- select/insert/update tách riêng — REST client không tự ý sửa/xoá tin của
-- người khác ngoài đường RPC.
drop policy if exists group_messages_all on public.group_messages;

drop policy if exists group_messages_select on public.group_messages;
create policy group_messages_select on public.group_messages
  for select using (public.is_group_member(group_id, auth.uid()));

drop policy if exists group_messages_insert on public.group_messages;
create policy group_messages_insert on public.group_messages
  for insert with check (
    public.is_group_member(group_id, auth.uid()) and sender_id = auth.uid()
  );

drop policy if exists group_messages_update on public.group_messages;
create policy group_messages_update on public.group_messages
  for update using (sender_id = auth.uid())
  with check (sender_id = auth.uid());

create or replace function public.edit_group_message(p_message_id uuid, p_message text)
returns table (
  id uuid, group_id uuid, sender_id uuid, message text, created_at timestamptz,
  edited_at timestamptz, deleted_at timestamptz,
  attachment_url text, attachment_name text, attachment_type text, attachment_size bigint,
  sender_email text
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
           u.email::text
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
  sender_email text
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

  -- Xoá mềm: giữ lại id/sender/created_at để hiển thị chỗ trống trong lịch
  -- sử hội thoại, nhưng xoá nội dung/đính kèm khỏi mọi phản hồi API sau đó.
  update public.group_messages gmsg
  set deleted_at = now(), message = null,
      attachment_url = null, attachment_name = null, attachment_type = null, attachment_size = null
  where gmsg.id = p_message_id;

  return query
    select gmsg.id, gmsg.group_id, gmsg.sender_id, gmsg.message, gmsg.created_at,
           gmsg.edited_at, gmsg.deleted_at,
           gmsg.attachment_url, gmsg.attachment_name, gmsg.attachment_type, gmsg.attachment_size,
           u.email::text
    from public.group_messages gmsg
    join auth.users u on u.id = gmsg.sender_id
    where gmsg.id = p_message_id;
end;
$$;

-- list_group_messages: bổ sung các cột mới (edited_at/deleted_at/attachment_*)
create or replace function public.list_group_messages(p_group_id uuid)
returns table (
  id uuid, group_id uuid, sender_id uuid, message text, created_at timestamptz,
  edited_at timestamptz, deleted_at timestamptz,
  attachment_url text, attachment_name text, attachment_type text, attachment_size bigint,
  sender_email text
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
           u.email::text
    from public.group_messages gmsg
    join auth.users u on u.id = gmsg.sender_id
    where gmsg.group_id = p_group_id
    order by gmsg.created_at asc;
end;
$$;

-- Storage bucket cho file đính kèm trong chat nhóm. Quy ước đường dẫn:
-- group-attachments/<group_id>/<filename>, giống pattern của
-- 0005_avatars_storage.sql — public để hiển thị/tải trực tiếp qua URL, chỉ
-- thành viên nhóm mới được upload, chỉ người upload mới được xoá.
insert into storage.buckets (id, name, public)
values ('group-attachments', 'group-attachments', true)
on conflict (id) do nothing;

drop policy if exists "Group attachments are publicly accessible" on storage.objects;
create policy "Group attachments are publicly accessible"
  on storage.objects for select
  using (bucket_id = 'group-attachments');

drop policy if exists "Group members can upload attachments" on storage.objects;
create policy "Group members can upload attachments"
  on storage.objects for insert
  with check (
    bucket_id = 'group-attachments'
    and public.is_group_member(((storage.foldername(name))[1])::uuid, auth.uid())
  );

drop policy if exists "Uploaders can delete their own group attachments" on storage.objects;
create policy "Uploaders can delete their own group attachments"
  on storage.objects for delete
  using (bucket_id = 'group-attachments' and owner = auth.uid());
