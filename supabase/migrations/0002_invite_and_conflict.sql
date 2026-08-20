-- Phase 1.2 — Invite/accept/decline (trong app, chưa gửi email) + conflict detection.
-- Chạy 1 lần trong Supabase SQL Editor, SAU khi đã chạy supabase/schema.sql.
-- Conflict detection không cần thay đổi gì ở DB (chỉ query events có sẵn),
-- migration này chỉ phục vụ invite/accept/decline.

-- ============================================================
-- 1. Tra user_id theo email để mời (không lộ dữ liệu nào khác ngoài id).
-- ============================================================
create or replace function public.find_user_id_by_email(p_email text)
returns uuid
language sql
security definer set search_path = public
as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;

-- ============================================================
-- 2. Danh sách người tham gia kèm email — chỉ trả về nếu người gọi là
--    member của calendar chứa event đó (tự kiểm tra quyền bên trong).
-- ============================================================
create or replace function public.list_event_attendees(p_event_id uuid)
returns table (
  id uuid,
  user_id uuid,
  email text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
begin
  if not exists (
    select 1 from public.events e
    join public.calendar_members cm on cm.calendar_id = e.calendar_id
    where e.id = p_event_id and cm.user_id = auth.uid()
  ) then
    raise exception 'not authorized';
  end if;

  return query
    select ea.id, ea.user_id, u.email::text, ea.status, ea.created_at
    from public.event_attendees ea
    join auth.users u on u.id = ea.user_id
    where ea.event_id = p_event_id;
end;
$$;

-- ============================================================
-- 3. RLS bổ sung: người được mời (chưa chắc đã là calendar_member) vẫn cần
--    thấy chính lời mời của mình, thấy được event đó, và tự đổi status.
-- ============================================================
drop policy if exists event_attendees_select_self on public.event_attendees;
create policy event_attendees_select_self on public.event_attendees
  for select using (user_id = auth.uid());

drop policy if exists event_attendees_respond_self on public.event_attendees;
create policy event_attendees_respond_self on public.event_attendees
  for update using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists events_select_invited on public.events;
create policy events_select_invited on public.events
  for select using (
    exists (select 1 from public.event_attendees ea
            where ea.event_id = events.id and ea.user_id = auth.uid())
  );
