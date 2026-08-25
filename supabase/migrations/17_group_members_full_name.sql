-- list_group_members chỉ trả email (03_group_members_with_email.sql), nên
-- dropdown "Chọn thành viên phụ trách" / assignee của task phải hiển thị
-- email thay vì tên hiển thị (đặt ở Cài đặt tài khoản, lưu vào
-- auth.users.raw_user_meta_data ->> 'full_name') — cùng vấn đề đã xử lý cho
-- chat ở 14_group_messages_sender_name.sql, giờ áp dụng tương tự cho RPC này.
--
-- Postgres chặn create or replace khi kiểu trả về "returns table" đổi, kể cả
-- chỉ THÊM cột vào cuối (lỗi 42P13: cannot change return type of existing
-- function) — phải drop function trước rồi tạo lại.
--
-- Chạy 1 lần trong Supabase SQL Editor, sau 03_group_members_with_email.sql.

drop function if exists public.list_group_members(uuid);

create function public.list_group_members(p_group_id uuid)
returns table (
  id uuid,
  group_id uuid,
  user_id uuid,
  role text,
  created_at timestamptz,
  email text,
  full_name text
)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
    select gm.id, gm.group_id, gm.user_id, gm.role, gm.created_at,
           u.email::text, u.raw_user_meta_data->>'full_name'
    from public.group_members gm
    join auth.users u on u.id = gm.user_id
    where gm.group_id = p_group_id;
end;
$$;
