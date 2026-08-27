-- Cho phép BẤT KỲ thành viên nào của lịch (kể cả role 'viewer') mời khách vào
-- sự kiện — trước đây chỉ owner/editor mới mời được
-- (event_attendees_write_editor, migration 26), khiến viewer bấm "Mời" bị
-- chặn bởi RLS với lỗi "new row violates row-level security policy for table
-- event_attendees". Sửa/xoá trạng thái người tham gia (accept/decline/xoá)
-- vẫn giữ nguyên chỉ owner/editor — chỉ nới quyền THÊM (insert).
--
-- Policy permissive: cộng thêm policy này bên cạnh event_attendees_write_editor
-- (không xoá), Postgres OR hai policy lại nên viewer lẫn owner/editor đều
-- insert được.
--
-- Chạy 1 lần trong Supabase SQL Editor, SAU 26_fix_event_attendees_rls_recursion_fully.sql.
-- An toàn khi chạy lại nhiều lần (drop policy if exists).

drop policy if exists event_attendees_insert_member on public.event_attendees;
create policy event_attendees_insert_member on public.event_attendees
  for insert
  with check (
    public.is_event_calendar_member(event_attendees.event_id, auth.uid())
  );
