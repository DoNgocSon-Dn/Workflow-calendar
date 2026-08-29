-- Migration 35: Web Push — lưu subscription của trình duyệt để đẩy nhắc nhở
-- kể cả khi app đã đóng.
--
-- Mỗi hàng = một trình duyệt/thiết bị đã bật "Thông báo trên máy". `endpoint`
-- là URL do push service (FCM/Mozilla/Apple) cấp, duy nhất cho mỗi đăng ký.
--
-- Idempotent. Chạy trong Supabase Dashboard > SQL Editor.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_user_id_idx
  on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

-- Người dùng chỉ thấy/xoá subscription của chính mình. Backend ghi/đọc để gửi
-- push bằng service-role key (bỏ qua RLS) trong cron.
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
