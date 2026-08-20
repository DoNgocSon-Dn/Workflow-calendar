-- Migration: trả kèm email khi liệt kê group_members/group_messages.
-- Chạy 1 lần trong Supabase SQL Editor, SAU khi đã chạy 02_groups_workspace.sql.
--
-- Vấn đề: group_members/group_messages không có cột email (chỉ có user_id/
-- sender_id), nên frontend phải fallback hiển thị UUID thô (vd. trong dropdown
-- "Chọn thành viên phụ trách", tab Thành viên, chat) thay vì email. Theo đúng
-- pattern của list_event_attendees (0002_invite_and_conflict.sql), thêm 2 RPC
-- security definer join sang auth.users, tự kiểm tra quyền (phải là member
-- của group) bên trong.

create or replace function public.list_group_members(p_group_id uuid)
returns table (
  id uuid,
  group_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  email text
)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
    select gm.id, gm.group_id, gm.user_id, gm.role, gm.created_at, u.email::text
    from public.group_members gm
    join auth.users u on u.id = gm.user_id
    where gm.group_id = p_group_id;
end;
$$;

create or replace function public.list_group_messages(p_group_id uuid)
returns table (
  id uuid,
  group_id uuid,
  sender_id uuid,
  message text,
  created_at timestamptz,
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
    select gmsg.id, gmsg.group_id, gmsg.sender_id, gmsg.message, gmsg.created_at, u.email::text
    from public.group_messages gmsg
    join auth.users u on u.id = gmsg.sender_id
    where gmsg.group_id = p_group_id
    order by gmsg.created_at asc;
end;
$$;
