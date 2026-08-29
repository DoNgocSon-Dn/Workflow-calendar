-- Mời khách vào sự kiện bằng email BẤT KỲ (kể cả người chưa có tài khoản
-- Workflow) + gửi lời mời iCalendar (.ics) qua mail.
--
-- Trước đây invite() bắt buộc email phải khớp một tài khoản auth.users; giờ
-- cho phép dòng event_attendees có user_id = NULL và lưu thẳng email khách.
--
-- Chạy 1 lần trong Supabase SQL Editor, SAU 36_event_recurrence_exceptions.sql.
-- An toàn khi chạy lại nhiều lần.

-- 1. Cột mới -----------------------------------------------------------------
alter table public.event_attendees
  add column if not exists email         text,
  add column if not exists ical_sequence integer not null default 0;

-- 2. Chống mời trùng một email cho cùng sự kiện.
--    `unique (event_id, user_id)` không bắt được vì user_id NULL coi là khác
--    nhau, nên cần index riêng trên lower(email) cho các dòng khách ngoài.
create unique index if not exists event_attendees_event_email_uidx
  on public.event_attendees (event_id, lower(email))
  where email is not null;

-- 3. list_event_attendees: LEFT JOIN auth.users để không rớt dòng khách ngoài,
--    trả email lấy từ tài khoản nếu có, không thì lấy email đã lưu trên dòng.
--    (bản gốc: 0002_invite_and_conflict.sql — INNER JOIN)
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
    select ea.id,
           ea.user_id,
           coalesce(u.email::text, ea.email) as email,
           ea.status,
           ea.created_at
    from public.event_attendees ea
    left join auth.users u on u.id = ea.user_id
    where ea.event_id = p_event_id;
end;
$$;

revoke execute on function public.list_event_attendees(uuid) from anon;
