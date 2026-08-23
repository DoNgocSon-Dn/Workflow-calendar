-- Migration: sửa/xoá nhóm (chỉ chủ nhóm) + ẩn/hiện nhóm theo từng thành viên.
-- Chạy 1 lần trong Supabase SQL Editor, SAU khi đã chạy 02_groups_workspace.sql,
-- 03_group_members_with_email.sql và 04_group_chat_enhancements.sql.

-- Ẩn/hiện là trạng thái RIÊNG của mỗi thành viên nên nằm trên group_members,
-- không phải trên groups: người này ẩn không được làm nhóm biến mất với người kia.
alter table public.group_members
  add column if not exists hidden_at timestamptz;

-- Chỉ liệt kê các dòng đang ẩn — bảng group_members đọc theo group_id là chính,
-- index này chỉ phục vụ trigger gỡ ẩn hàng loạt khi có tin nhắn mới.
create index if not exists group_members_hidden_idx
  on public.group_members (group_id)
  where hidden_at is not null;

-- Policy group_members_update chỉ cho CHỦ NHÓM ghi (dùng để phân quyền), nên
-- thành viên không thể tự cập nhật hidden_at bằng REST. Đi qua RPC security
-- definer, và RPC chỉ đụng đúng dòng của auth.uid() nên không mở rộng quyền gì
-- thêm (đặc biệt là không cho tự nâng role).
create or replace function public.set_group_hidden(p_group_id uuid, p_hidden boolean)
returns timestamptz
language plpgsql
security definer set search_path = public
as $$
declare
  v_hidden_at timestamptz;
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'not authorized';
  end if;

  update public.group_members
     set hidden_at = case when p_hidden then now() else null end
   where group_id = p_group_id
     and user_id = auth.uid()
  returning hidden_at into v_hidden_at;

  if not found then
    raise exception 'not found';
  end if;

  return v_hidden_at;
end;
$$;

-- "Có tin nhắn tới thì nhóm hiện lại": làm bằng trigger chứ không phải ở tầng
-- service, để mọi đường ghi vào group_messages (REST, RPC, backend) đều gỡ ẩn —
-- không có cửa nào khiến tin nhắn mới rơi vào một nhóm đang ẩn.
create or replace function public.unhide_group_on_message()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  update public.group_members
     set hidden_at = null
   where group_id = new.group_id
     and hidden_at is not null;
  return new;
end;
$$;

drop trigger if exists group_messages_unhide on public.group_messages;
create trigger group_messages_unhide
  after insert on public.group_messages
  for each row execute function public.unhide_group_on_message();

-- Trả về danh sách user_id vừa được gỡ ẩn để backend biết cần bắn realtime cho
-- ai. Gọi TRƯỚC khi insert tin nhắn (sau khi insert thì trigger đã dọn sạch).
create or replace function public.list_group_hidden_members(p_group_id uuid)
returns table (user_id uuid)
language sql
security definer set search_path = public
as $$
  select gm.user_id
  from public.group_members gm
  where gm.group_id = p_group_id
    and gm.hidden_at is not null
    and public.is_group_member(p_group_id, auth.uid());
$$;

grant execute on function public.set_group_hidden(uuid, boolean) to authenticated;
grant execute on function public.list_group_hidden_members(uuid) to authenticated;

-- groups_update_owner / groups_delete_owner đã có sẵn từ 02_groups_workspace.sql
-- (for update/delete using owner_id = auth.uid()), nên sửa/xoá nhóm chỉ cần
-- thêm WITH CHECK để owner_id không bị đổi sang người khác khi update.
drop policy if exists groups_update_owner on public.groups;
create policy groups_update_owner on public.groups
  for update using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
