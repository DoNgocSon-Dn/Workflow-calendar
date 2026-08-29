-- Mốc nhắc nhở mặc định của mỗi người dùng.
--
-- Khi một người ĐỒNG Ý lời mời tham gia sự kiện, hệ thống tự tạo lời nhắc
-- (popup + web push) theo bộ mốc này. Người dùng đổi bộ mốc trong Settings.
--
-- Chạy 1 lần trong Supabase SQL Editor, SAU 37_event_attendees_external_email.sql.
-- An toàn khi chạy lại nhiều lần.

create table if not exists public.reminder_preferences (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  offsets    integer[] not null default '{30,15,5,0}',  -- số phút TRƯỚC giờ bắt đầu (0 = đúng giờ)
  updated_at timestamptz not null default now()
);

alter table public.reminder_preferences enable row level security;

drop policy if exists reminder_prefs_own on public.reminder_preferences;
create policy reminder_prefs_own on public.reminder_preferences
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
