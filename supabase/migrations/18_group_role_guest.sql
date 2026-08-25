-- Thêm lại vai trò GUEST (Khách) — migration 15 đã cố tình bỏ nó, nhưng giờ
-- cần lại: Khách chỉ được XEM lịch/công việc của nhóm, KHÔNG được nhắn tin.
-- Chặn nhắn tin đã có ở tầng NestJS (groups.service.ts#sendMessage dùng
-- canChat()); migration này chỉ nới đúng những chỗ CSDL đang khoá cứng
-- role in ('leader','admin','member') / ('admin','member') để 'guest' đi lọt.
--
-- An toàn khi chạy lại nhiều lần.

begin;

alter table public.group_members drop constraint if exists group_members_role_check;
alter table public.group_members
  add constraint group_members_role_check
  check (role in ('leader', 'admin', 'member', 'guest'));

alter table public.group_invites drop constraint if exists group_invites_role_check;
alter table public.group_invites
  add constraint group_invites_role_check
  check (role in ('admin', 'member', 'guest'));

-- group_role_rank() (migration 15) dùng để so sánh thứ bậc trong RLS —
-- guest phải xếp DƯỚI member, không rơi vào nhánh "else 0" (vốn dành cho
-- role lạ/không hợp lệ, tức "không phải thành viên").
create or replace function public.group_role_rank(p_role text)
returns int
language sql
immutable
as $$
  select case p_role
    when 'leader' then 4
    when 'admin'  then 3
    when 'member' then 2
    when 'guest'  then 1
    else 0
  end;
$$;

-- group_members_update policy (migration 15) chỉ cho gán role in ('admin','member')
-- qua UPDATE thường — thêm 'guest' vào danh sách gán được.
drop policy if exists group_members_update on public.group_members;
create policy group_members_update on public.group_members
  for update using (
    public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      > public.group_role_rank(public.group_role_of(group_id, user_id))
  )
  with check (
    role in ('admin', 'member', 'guest')
    and public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      > public.group_role_rank(role)
  );

-- Khách không được ghi vào group_messages — chỉ SELECT (đã có qua
-- group_messages_all cũ dùng is_group_member cho mọi thao tác); tách INSERT
-- riêng ra để thêm điều kiện cấp bậc, và giữ UPDATE/DELETE/SELECT như cũ.
drop policy if exists group_messages_all on public.group_messages;
drop policy if exists group_messages_select on public.group_messages;
drop policy if exists group_messages_insert on public.group_messages;
drop policy if exists group_messages_update on public.group_messages;
drop policy if exists group_messages_delete on public.group_messages;

create policy group_messages_select on public.group_messages
  for select using (public.is_group_member(group_id, auth.uid()));

create policy group_messages_insert on public.group_messages
  for insert with check (
    public.is_group_member(group_id, auth.uid())
    and public.group_role_rank(public.group_role_of(group_id, auth.uid())) > 1
  );

create policy group_messages_update on public.group_messages
  for update using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));

create policy group_messages_delete on public.group_messages
  for delete using (public.is_group_member(group_id, auth.uid()));

commit;
