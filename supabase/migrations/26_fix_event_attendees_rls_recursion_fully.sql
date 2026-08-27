-- Vá TIẾP recursion giữa events <-> event_attendees — migration 23 mới vá một
-- chiều (policy events_select_invited đọc event_attendees, đã chuyển qua hàm
-- SECURITY DEFINER is_event_attendee). Chiều NGƯỢC LẠI vẫn còn nguyên từ
-- schema.sql: hai policy trên event_attendees (select_member, write_editor)
-- subquery THẲNG vào public.events, không qua hàm nào cả. Một khi cả hai
-- chiều cùng tồn tại, Postgres có thể rơi vào vòng lặp đánh giá policy khi
-- SELECT * FROM events (đọc events -> events_select_invited gọi
-- is_event_attendee -> đọc event_attendees -> event_attendees_select_member
-- lại subquery events -> lặp lại) — đúng lỗi "infinite recursion detected in
-- policy for relation events" gặp phải trên production.
--
-- Cách vá: đưa NỐT hai policy còn lại của event_attendees qua hàm SECURITY
-- DEFINER, cùng khuôn với is_event_attendee/is_calendar_member — không còn
-- policy nào ở HAI PHÍA subquery thẳng sang bảng kia nữa, cắt đứt hoàn toàn
-- khả năng đệ quy dù theo chiều nào.
--
-- Chạy 1 lần trong Supabase SQL Editor, SAU 23_fix_event_attendees_rls_recursion.sql.
-- An toàn khi chạy lại nhiều lần (create or replace + drop policy if exists).

-- ============================================================
-- 1. Hai hàm SECURITY DEFINER thay cho subquery thẳng vào events.
-- ============================================================

-- Có phải member của calendar chứa event đó không — dùng cho quyền XEM danh
-- sách người tham gia (event_attendees_select_member cũ).
create or replace function public.is_event_calendar_member(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    join public.calendar_members cm on cm.calendar_id = e.calendar_id
    where e.id = p_event_id and cm.user_id = p_user_id
  );
$$;

-- Có phải owner/editor của calendar chứa event đó không — dùng cho quyền GHI
-- (mời/xoá/đổi trạng thái người tham gia — event_attendees_write_editor cũ).
create or replace function public.is_event_calendar_editor_or_owner(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    join public.calendar_members cm on cm.calendar_id = e.calendar_id
    where e.id = p_event_id and cm.user_id = p_user_id
      and cm.role in ('owner', 'editor')
  );
$$;

-- ============================================================
-- 2. Thay hai policy cũ trên event_attendees để dùng hàm ở trên thay vì
--    subquery thẳng vào events.
-- ============================================================
drop policy if exists event_attendees_select_member on public.event_attendees;
create policy event_attendees_select_member on public.event_attendees
  for select using (
    public.is_event_calendar_member(event_attendees.event_id, auth.uid())
  );

drop policy if exists event_attendees_write_editor on public.event_attendees;
create policy event_attendees_write_editor on public.event_attendees
  for all using (
    public.is_event_calendar_editor_or_owner(event_attendees.event_id, auth.uid())
  )
  with check (
    public.is_event_calendar_editor_or_owner(event_attendees.event_id, auth.uid())
  );

-- ============================================================
-- 3. Re-assert policy của migration 23 — idempotent, chạy lại cho chắc phòng
--    trường hợp bản đang chạy trên production lệch so với file migration.
-- ============================================================
create or replace function public.is_event_attendee(p_event_id uuid, p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.event_attendees
    where event_id = p_event_id and user_id = p_user_id
  );
$$;

drop policy if exists events_select_invited on public.events;
create policy events_select_invited on public.events
  for select using (
    public.is_event_attendee(events.id, auth.uid())
  );
