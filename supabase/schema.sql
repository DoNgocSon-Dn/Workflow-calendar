-- Phase 1.1 core schema — chạy 1 lần trong Supabase SQL Editor.
-- Xem plan357.md mục "Setup chung" và mục 2 (Người 1) để biết bối cảnh.

create extension if not exists pgcrypto;

-- ============================================================
-- 1. calendars
-- ============================================================
create table public.calendars (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  color      text not null default 'blue'
             check (color in ('blue','green','orange','red','purple','teal')),
  created_at timestamptz not null default now()
);

-- ============================================================
-- 2. calendar_members
-- ============================================================
create table public.calendar_members (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'viewer'
              check (role in ('owner','editor','viewer')),
  created_at  timestamptz not null default now(),
  unique (calendar_id, user_id)
);

-- ============================================================
-- 3. events
-- ============================================================
create table public.events (
  id          uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars(id) on delete cascade,
  title       text not null,
  location    text,
  description text,
  start_at    timestamptz not null,
  end_at      timestamptz not null,
  all_day     boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint events_time_check check (end_at > start_at)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger events_set_updated_at
before update on public.events
for each row execute function public.set_updated_at();

-- ============================================================
-- 4. event_attendees (bảng tạo theo yêu cầu "setup chung" trong plan357.md;
--    endpoint invite/accept/decline là Phase 1.2, CHƯA build trong đợt này)
-- ============================================================
create table public.event_attendees (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete cascade,
  status     text not null default 'pending'
             check (status in ('pending','accepted','declined')),
  created_at timestamptz not null default now(),
  unique (event_id, user_id)
);

-- ============================================================
-- Tự tạo 1 calendar cá nhân cho mỗi user mới đăng ký.
-- Bắt buộc vì frontend hiện chưa có UI "tạo calendar" — nếu không có trigger
-- này, user mới sẽ không có calendar nào để thấy sau khi đăng nhập.
-- SECURITY DEFINER: chạy trong lúc insert vào auth.users, trước khi user có
-- session/auth.uid() nên phải bypass RLS có chủ đích.
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  new_calendar_id uuid;
begin
  insert into public.calendars (owner_id, name, color)
  values (new.id, 'Cá nhân', 'blue')
  returning id into new_calendar_id;

  insert into public.calendar_members (calendar_id, user_id, role)
  values (new_calendar_id, new.id, 'owner');

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ============================================================
-- RPC dùng cho POST /calendars — insert calendars + calendar_members atomic
-- trong 1 lần gọi. SECURITY INVOKER (mặc định): chạy với auth.uid() thật của
-- người gọi nên vẫn bị RLS bên dưới kiểm tra như bình thường.
-- ============================================================
create or replace function public.create_calendar_with_owner(p_name text, p_color text)
returns public.calendars
language plpgsql
security invoker
as $$
declare
  result public.calendars;
begin
  insert into public.calendars (owner_id, name, color)
  values (auth.uid(), p_name, p_color)
  returning * into result;

  insert into public.calendar_members (calendar_id, user_id, role)
  values (result.id, auth.uid(), 'owner');

  return result;
end;
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.calendars        enable row level security;
alter table public.calendar_members enable row level security;
alter table public.events           enable row level security;
alter table public.event_attendees  enable row level security;

-- ============================================================
-- Helper functions for RLS to avoid infinite recursion
-- ============================================================
create or replace function public.is_calendar_member(p_calendar_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1 from public.calendar_members
    where calendar_id = p_calendar_id and user_id = p_user_id
  );
$$;

create or replace function public.is_calendar_editor_or_owner(p_calendar_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1 from public.calendar_members
    where calendar_id = p_calendar_id and user_id = p_user_id and role in ('owner','editor')
  );
$$;

create or replace function public.is_calendar_owner(p_calendar_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1 from public.calendar_members
    where calendar_id = p_calendar_id and user_id = p_user_id and role = 'owner'
  );
$$;

-- calendars: đọc theo membership; ghi theo role owner/editor; xoá chỉ owner
create policy calendars_select_member on public.calendars
  for select using (
    public.is_calendar_member(id, auth.uid())
  );

create policy calendars_insert_own on public.calendars
  for insert with check (owner_id = auth.uid());

create policy calendars_update_owner_editor on public.calendars
  for update using (
    public.is_calendar_editor_or_owner(id, auth.uid())
  );

create policy calendars_delete_owner on public.calendars
  for delete using (
    public.is_calendar_owner(id, auth.uid())
  );

-- calendar_members: member nào cũng xem được danh sách; chỉ owner đổi role /
-- xoá người khác; 1 member có thể tự rời khỏi calendar
create policy calendar_members_select_member on public.calendar_members
  for select using (
    user_id = auth.uid() or public.is_calendar_member(calendar_id, auth.uid())
  );

create policy calendar_members_insert_self_owner on public.calendar_members
  for insert with check (user_id = auth.uid() and role = 'owner');

create policy calendar_members_update_owner on public.calendar_members
  for update using (
    public.is_calendar_owner(calendar_id, auth.uid())
  );

create policy calendar_members_delete_owner_or_self on public.calendar_members
  for delete using (
    user_id = auth.uid() or public.is_calendar_owner(calendar_id, auth.uid())
  );

-- events: đọc theo membership; ghi theo role owner/editor (viewer chỉ đọc)
create policy events_select_member on public.events
  for select using (
    public.is_calendar_member(calendar_id, auth.uid())
  );

create policy events_insert_editor on public.events
  for insert with check (
    public.is_calendar_editor_or_owner(calendar_id, auth.uid())
  );

create policy events_update_editor on public.events
  for update using (
    public.is_calendar_editor_or_owner(calendar_id, auth.uid())
  );

create policy events_delete_editor on public.events
  for delete using (
    public.is_calendar_editor_or_owner(calendar_id, auth.uid())
  );

-- event_attendees: RLS sẵn sàng cho Phase 1.2, chưa có endpoint nào dùng tới
create policy event_attendees_select_member on public.event_attendees
  for select using (
    exists (select 1 from public.events e
            join public.calendar_members cm on cm.calendar_id = e.calendar_id
            where e.id = event_attendees.event_id and cm.user_id = auth.uid())
  );

create policy event_attendees_write_editor on public.event_attendees
  for all using (
    exists (select 1 from public.events e
            join public.calendar_members cm on cm.calendar_id = e.calendar_id
            where e.id = event_attendees.event_id and cm.user_id = auth.uid()
              and cm.role in ('owner','editor'))
  )
  with check (
    exists (select 1 from public.events e
            join public.calendar_members cm on cm.calendar_id = e.calendar_id
            where e.id = event_attendees.event_id and cm.user_id = auth.uid()
              and cm.role in ('owner','editor'))
  );
