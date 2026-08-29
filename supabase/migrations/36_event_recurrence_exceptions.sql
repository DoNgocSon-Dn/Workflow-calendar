-- Migration 36: EXDATE cho chuỗi lặp lại + nền cho cron "lặp mãi mãi".
--
-- Vấn đề: sự kiện lặp lại được VẬT CHẤT HOÁ thành các hàng events thật, tối đa
-- ~180 lần / 2 năm rồi dừng. "Lặp không kết thúc" thực chất vẫn cạn.
--
-- Cách xử lý:
--   1. Cron `recurrence-cron.service` mỗi ngày nối thêm các lần lặp còn thiếu
--      cho tới mốc now + 400 ngày → chuỗi không bao giờ cạn.
--   2. Xoá một buổi lẻ (DELETE /events/:id của một hàng thuộc series) ghi lại
--      vào bảng này. Cron top-up đọc bảng này để KHÔNG tạo lại buổi đã xoá —
--      kể cả sau khi buổi đó bị xoá vĩnh viễn khỏi thùng rác.
--
-- Idempotent. Chạy trong Supabase Dashboard > SQL Editor.

create table if not exists public.event_recurrence_exceptions (
  series_id   uuid not null,
  occurred_at timestamptz not null,
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (series_id, occurred_at)
);

create index if not exists event_recurrence_exceptions_series_idx
  on public.event_recurrence_exceptions (series_id);

alter table public.event_recurrence_exceptions enable row level security;

-- Thành viên của lịch chứa chuỗi được đọc/ghi exception của lịch đó. Cron dùng
-- service-role key (bỏ qua RLS).
drop policy if exists "calendar members manage recurrence exceptions"
  on public.event_recurrence_exceptions;
create policy "calendar members manage recurrence exceptions"
  on public.event_recurrence_exceptions
  for all
  using (
    calendar_id in (
      select calendar_id from public.calendar_members where user_id = auth.uid()
    )
  )
  with check (
    calendar_id in (
      select calendar_id from public.calendar_members where user_id = auth.uid()
    )
  );
