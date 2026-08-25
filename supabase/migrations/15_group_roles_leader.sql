-- Migration: chuẩn hoá vai trò nhóm về LEADER / ADMIN / MEMBER
--
-- 1. Đổi 'owner' -> 'leader' (giao diện gọi là "Trưởng nhóm", không dùng OWNER).
-- 2. Gộp 'guest' -> 'member' (bỏ hẳn vai trò Khách khỏi mô hình nhóm).
-- 3. Siết RLS: trước đây BẤT KỲ thành viên nào cũng xoá được BẤT KỲ ai — kể cả
--    trưởng nhóm — vì policy delete chỉ kiểm tra "có phải thành viên không".
--
-- An toàn khi chạy lại nhiều lần.

-- ---------------------------------------------------------------------------
-- 1. Dữ liệu: nới ràng buộc -> đổi giá trị -> siết lại ràng buộc
-- ---------------------------------------------------------------------------

-- Bỏ CHECK cũ trước, nếu không lệnh UPDATE bên dưới sẽ bị chính nó chặn.
alter table public.group_members
  drop constraint if exists group_members_role_check;

update public.group_members set role = 'leader' where role = 'owner';
update public.group_members set role = 'member' where role = 'guest';

-- Bất kỳ giá trị lạ nào còn sót lại đều hạ về cấp thấp nhất, để câu ADD
-- CONSTRAINT bên dưới không thất bại giữa chừng trên dữ liệu thật.
update public.group_members
  set role = 'member'
  where role not in ('leader', 'admin', 'member');

alter table public.group_members
  add constraint group_members_role_check
  check (role in ('leader', 'admin', 'member'));

-- Lời mời cũng chỉ còn hai vai trò gán được.
update public.group_invites set role = 'member' where role in ('guest', 'owner', 'leader');

-- ---------------------------------------------------------------------------
-- 2. Đồng bộ: trưởng nhóm luôn phải có hàng thành viên với role 'leader'
-- ---------------------------------------------------------------------------

-- groups.owner_id là nguồn xác định ai lãnh đạo nhóm; hàng trong
-- group_members chỉ là bản sao để truy vấn cho nhanh. Nếu hai chỗ lệch nhau
-- thì kiểm tra quyền sẽ ra kết quả khác nhau tuỳ đường đi, nên ép chúng khớp.
update public.group_members gm
  set role = 'leader'
  from public.groups g
  where g.id = gm.group_id
    and g.owner_id = gm.user_id
    and gm.role <> 'leader';

-- Ngược lại: không ai ngoài owner_id được mang role 'leader'.
update public.group_members gm
  set role = 'admin'
  from public.groups g
  where g.id = gm.group_id
    and g.owner_id <> gm.user_id
    and gm.role = 'leader';

-- ---------------------------------------------------------------------------
-- 3. Hàm trợ giúp: vai trò hiệu lực của một người trong một nhóm
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER để policy tự truy vấn được group_members mà không kích
-- hoạt lại chính policy đó (đệ quy vô hạn).
create or replace function public.group_role_of(p_group_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.groups g
      where g.id = p_group_id and g.owner_id = p_user_id
    ) then 'leader'
    else coalesce(
      (select gm.role from public.group_members gm
        where gm.group_id = p_group_id and gm.user_id = p_user_id),
      'none'
    )
  end;
$$;

create or replace function public.group_role_rank(p_role text)
returns int
language sql
immutable
as $$
  select case p_role
    when 'leader' then 3
    when 'admin'  then 2
    when 'member' then 1
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4. RLS: chỉ cấp cao hơn mới đụng được cấp thấp hơn
-- ---------------------------------------------------------------------------

-- XOÁ: tự rời nhóm được (trừ trưởng nhóm — phải chuyển quyền trước), hoặc xoá
-- người có cấp THẤP HƠN mình. Policy cũ cho phép mọi thành viên xoá mọi người.
drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members
  for delete using (
    (
      -- tự rời nhóm
      user_id = auth.uid()
      and public.group_role_of(group_id, auth.uid()) <> 'leader'
    )
    or (
      -- quản lý người cấp dưới
      public.group_role_rank(public.group_role_of(group_id, auth.uid()))
        > public.group_role_rank(public.group_role_of(group_id, user_id))
    )
  );

-- CẬP NHẬT: chỉ đổi được quyền của người cấp dưới, và không được đặt ai thành
-- 'leader' qua đường này (ghế đó chỉ đổi chủ bằng luồng chuyển quyền).
drop policy if exists group_members_update on public.group_members;
create policy group_members_update on public.group_members
  for update using (
    public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      > public.group_role_rank(public.group_role_of(group_id, user_id))
  )
  with check (
    role in ('admin', 'member')
    and public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      > public.group_role_rank(role)
  );

-- THÊM: người tự nhận lời mời (hàng của chính mình), hoặc quản trị viên/trưởng
-- nhóm thêm người khác. Policy cũ cho phép mọi thành viên thêm bất kỳ ai.
drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members
  for insert with check (
    user_id = auth.uid()
    or public.group_role_rank(public.group_role_of(group_id, auth.uid()))
       >= public.group_role_rank('admin')
  );
