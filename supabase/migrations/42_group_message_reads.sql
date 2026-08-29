-- "Đã xem" cho chat nhóm: mỗi thành viên có một mốc "đã đọc tới đâu".
--
-- Bảng riêng thay vì thêm cột vào group_members: policy group_members_update
-- (migration 15b/18) đòi người ghi phải CẤP CAO HƠN hàng bị ghi, nên một thành
-- viên không tự cập nhật được hàng của chính mình. Bảng này có policy "được ghi
-- hàng của chính mình" đơn giản.
--
-- Chạy 1 lần trong Supabase SQL Editor, SAU 02_groups_workspace.sql (cần
-- is_group_member). An toàn khi chạy lại.

create table if not exists public.group_message_reads (
  group_id     uuid not null references public.groups(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

alter table public.group_message_reads enable row level security;

-- Thành viên nhóm xem được mốc đọc của MỌI thành viên (để hiện "Đã xem" +
-- avatar người đã đọc).
drop policy if exists group_message_reads_select on public.group_message_reads;
create policy group_message_reads_select on public.group_message_reads
  for select using (public.is_group_member(group_id, auth.uid()));

-- Chỉ được ghi / sửa hàng của CHÍNH MÌNH.
drop policy if exists group_message_reads_upsert on public.group_message_reads;
create policy group_message_reads_upsert on public.group_message_reads
  for insert with check (user_id = auth.uid());

drop policy if exists group_message_reads_update on public.group_message_reads;
create policy group_message_reads_update on public.group_message_reads
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'group_message_reads'
  ) then
    alter publication supabase_realtime add table public.group_message_reads;
  end if;
end $$;
