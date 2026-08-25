-- list_group_members chỉ trả email (03_group_members_with_email.sql), nên
-- dropdown "Chọn thành viên phụ trách" / assignee của task phải hiển thị
-- email thay vì tên hiển thị (đặt ở Cài đặt tài khoản, lưu vào
-- auth.users.raw_user_meta_data ->> 'full_name') — cùng vấn đề đã xử lý cho
-- chat ở 14_group_messages_sender_name.sql, giờ áp dụng tương tự cho RPC này.
--
-- create or replace ĐỦ DÙNG ở đây (khác 14_...): chỉ THÊM cột mới vào cuối
-- danh sách cột trả về, không đổi/xoá cột cũ nào, nên không vướng lỗi 42P13.
--
-- Chạy 1 lần trong Supabase SQL Editor, sau 03_group_members_with_email.sql.

create or replace function public.list_group_members(p_group_id uuid)
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
