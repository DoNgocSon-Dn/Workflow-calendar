-- Phase 1.3 + 1.4 — reminders (cron), notes (personal), event_comments (team),
-- ai_conversations, token xác nhận invite qua email.
-- Chạy 1 lần trong Supabase SQL Editor, SAU khi đã chạy schema.sql + 0002.

-- ============================================================
-- 0. Hàm helper set_updated_at (đảm bảo tồn tại trước khi tạo trigger)
-- ============================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- 1. reminders — Phase 1.3
-- ============================================================
create table if not exists public.reminders (
  id             uuid primary key default gen_random_uuid(),
  event_id       uuid not null references public.events(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  remind_at      timestamptz not null,
  remind_type    text not null default 'popup'
                 check (remind_type in ('popup','email')),
  is_sent        boolean not null default false,
  snoozed_until  timestamptz,
  created_at     timestamptz not null default now()
);

alter table public.reminders enable row level security;

drop policy if exists reminders_all_own on public.reminders;
create policy reminders_all_own on public.reminders
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Cron job quét theo remind_at + is_sent — index cho nhanh.
create index if not exists reminders_due_idx on public.reminders (remind_at) where is_sent = false;

-- ============================================================
-- 2. notes — Phase 1.4 (personal, độc lập với event/calendar)
-- ============================================================
create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  content    text not null,
  color      text not null default 'yellow',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists notes_set_updated_at on public.notes;
create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

alter table public.notes enable row level security;

drop policy if exists notes_all_own on public.notes;
create policy notes_all_own on public.notes
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- 3. event_comments — Phase 1.4 (team, gắn theo event)
-- ============================================================
create table if not exists public.event_comments (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  content    text not null,
  created_at timestamptz not null default now()
);

alter table public.event_comments enable row level security;

drop policy if exists event_comments_select_member on public.event_comments;
create policy event_comments_select_member on public.event_comments
  for select using (
    exists (select 1 from public.events e
            join public.calendar_members cm on cm.calendar_id = e.calendar_id
            where e.id = event_comments.event_id and cm.user_id = auth.uid())
  );

drop policy if exists event_comments_insert_member on public.event_comments;
create policy event_comments_insert_member on public.event_comments
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.events e
                join public.calendar_members cm on cm.calendar_id = e.calendar_id
                where e.id = event_comments.event_id and cm.user_id = auth.uid())
  );

drop policy if exists event_comments_delete_own on public.event_comments;
create policy event_comments_delete_own on public.event_comments
  for delete using (user_id = auth.uid());

-- ============================================================
-- 4. ai_conversations — Phase 1.4 (AI chatbot MVP)
-- ============================================================
create table if not exists public.ai_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  messages   jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists ai_conversations_set_updated_at on public.ai_conversations;
create trigger ai_conversations_set_updated_at
before update on public.ai_conversations
for each row execute function public.set_updated_at();

alter table public.ai_conversations enable row level security;

drop policy if exists ai_conversations_all_own on public.ai_conversations;
create policy ai_conversations_all_own on public.ai_conversations
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ============================================================
-- 5. event_attendees — đảm bảo bảng tồn tại + thêm cột token xác nhận qua email (Phase 1.4)
-- ============================================================
create table if not exists public.event_attendees (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  status     text not null default 'pending'
             check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

alter table public.event_attendees enable row level security;

alter table public.event_attendees
  add column if not exists respond_token   uuid,
  add column if not exists token_expires_at timestamptz,
  add column if not exists token_used      boolean not null default false;

-- Endpoint respond-via-email tra theo token bằng service-role client (không
-- có JWT user) nên không cần policy RLS mới ở đây — service-role bypass RLS.

-- ============================================================
-- 6. RPC lấy email theo user_id — dùng cho cron gửi reminder qua email.
--    Chiều ngược của find_user_id_by_email (mục 0002).
-- ============================================================
create or replace function public.get_user_email_by_id(p_user_id uuid)
returns text
language sql
security definer set search_path = public
as $$
  select email::text from auth.users where id = p_user_id;
$$;
