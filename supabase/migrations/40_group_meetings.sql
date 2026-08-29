-- Phòng họp "đang mở" của nhóm — 1 hàng / nhóm.
--
-- Trước đây link phòng họp chỉ nằm trong bộ nhớ của người vừa tạo (signal
-- `savedMeet` phía client) nên F5 là mất, không sửa/gỡ được, người vào sau
-- không thấy. Bảng này giữ link cố định để:
--   • mọi thành viên thấy nút "Tham gia họp" nổi ở giao diện chính,
--   • Trưởng nhóm / Phó nhóm sửa link + giờ, hoặc gỡ khi họp xong (CRUD),
--   • tạo link xong tự đăng một dòng vào khung chat của nhóm.
--
-- Chạy 1 lần trong Supabase SQL Editor, SAU 02_groups_workspace.sql (cần
-- groups, group_members, is_group_member) và 15b_group_roles_leader.sql (cần
-- group_role_of, group_role_rank). An toàn khi chạy lại nhiều lần.

create table if not exists public.group_meetings (
  group_id     uuid primary key references public.groups(id) on delete cascade,
  link         text not null,
  title        text,
  starts_at    timestamptz,
  duration_min integer,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

alter table public.group_meetings enable row level security;

-- Mọi thành viên nhóm xem được phòng họp.
drop policy if exists group_meetings_select on public.group_meetings;
create policy group_meetings_select on public.group_meetings
  for select using (public.is_group_member(group_id, auth.uid()));

-- Chỉ Trưởng nhóm (LEADER) / Phó nhóm (ADMIN) tạo / sửa / gỡ.
-- group_role_of / group_role_rank là SECURITY DEFINER (migration 15b) nên gọi
-- từ đây không tạo vòng đệ quy RLS.
drop policy if exists group_meetings_insert on public.group_meetings;
create policy group_meetings_insert on public.group_meetings
  for insert with check (
    public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      >= public.group_role_rank('admin')
  );

drop policy if exists group_meetings_update on public.group_meetings;
create policy group_meetings_update on public.group_meetings
  for update using (
    public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      >= public.group_role_rank('admin')
  );

drop policy if exists group_meetings_delete on public.group_meetings;
create policy group_meetings_delete on public.group_meetings
  for delete using (
    public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      >= public.group_role_rank('admin')
  );

-- Realtime để client nghe 'group:meetingChanged' qua Supabase Realtime (kênh dự
-- phòng cạnh Socket.IO) — khớp cách migration 16 thêm các bảng group_* khác.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'group_meetings'
  ) then
    alter publication supabase_realtime add table public.group_meetings;
  end if;
end $$;
