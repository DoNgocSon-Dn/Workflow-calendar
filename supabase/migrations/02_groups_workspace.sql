-- Migration: Group Workspace (groups, group_members, group_tasks, group_messages)
-- Chạy 1 lần trong Supabase SQL Editor, SAU khi đã chạy schema.sql + 0002
-- (dùng find_user_id_by_email cho invite) — bất kể tên file "02_" đứng trước
-- "0002_" theo alphabet, thứ tự bắt buộc vẫn là schema.sql -> 0002 -> ... ->
-- 0006 -> file này, vì is_calendar_member/is_group_member ở đây phụ thuộc
-- các bảng/hàm đã tạo trước đó.

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  color       text not null default 'blue'
              check (color in ('blue','green','orange','red','purple','teal')),
  owner_id    uuid not null references auth.users(id) on delete cascade,
  calendar_id uuid references public.calendars(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null default 'member'
              check (role in ('owner','admin','member','guest')),
  created_at  timestamptz not null default now(),
  unique (group_id, user_id)
);

create table if not exists public.group_tasks (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  title       text not null,
  description text,
  status      text not null default 'todo'
              check (status in ('todo','in_progress','done')),
  assigned_to uuid references auth.users(id) on delete set null,
  due_date    timestamptz,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.group_messages (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  message     text not null,
  created_at  timestamptz not null default now()
);

-- RLS
alter table public.groups        enable row level security;
alter table public.group_members  enable row level security;
alter table public.group_tasks    enable row level security;
alter table public.group_messages enable row level security;

-- Fix calendars RLS SELECT policy so owner can SELECT their owned calendar immediately
drop policy if exists calendars_select_member on public.calendars;
create policy calendars_select_member on public.calendars
  for select using (
    owner_id = auth.uid() or public.is_calendar_member(id, auth.uid())
  );

-- Helper functions
create or replace function public.is_group_member(p_group_id uuid, p_user_id uuid)
returns boolean
language sql
security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = p_user_id
  );
$$;

-- RLS Policies
drop policy if exists groups_select_member on public.groups;
create policy groups_select_member on public.groups
  for select using (owner_id = auth.uid() or public.is_group_member(id, auth.uid()));

drop policy if exists groups_insert_own on public.groups;
create policy groups_insert_own on public.groups
  for insert with check (owner_id = auth.uid());

drop policy if exists groups_update_owner on public.groups;
create policy groups_update_owner on public.groups
  for update using (owner_id = auth.uid());

drop policy if exists groups_delete_owner on public.groups;
create policy groups_delete_owner on public.groups
  for delete using (owner_id = auth.uid());

drop policy if exists group_members_select on public.group_members;
create policy group_members_select on public.group_members
  for select using (user_id = auth.uid() or public.is_group_member(group_id, auth.uid()));

drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members
  for insert with check (user_id = auth.uid() or public.is_group_member(group_id, auth.uid()));

drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members
  for delete using (user_id = auth.uid() or public.is_group_member(group_id, auth.uid()));

-- Chỉ chủ nhóm (owner_id trên bảng groups) mới được đổi role của thành viên
-- khác — người tạo nhóm phân quyền sau khi đã thêm thành viên.
drop policy if exists group_members_update on public.group_members;
create policy group_members_update on public.group_members
  for update using (
    exists (select 1 from public.groups g where g.id = group_members.group_id and g.owner_id = auth.uid())
  )
  with check (
    exists (select 1 from public.groups g where g.id = group_members.group_id and g.owner_id = auth.uid())
  );

-- group_tasks không có cột user_id (chỉ có created_by/assigned_to) — policy cũ
-- tham chiếu "user_id = auth.uid()" sẽ lỗi "column user_id does not exist" và
-- chặn đứng mọi thao tác trên bảng này. Quyền truy cập chỉ nên xét theo
-- membership của group.
drop policy if exists group_tasks_all on public.group_tasks;
create policy group_tasks_all on public.group_tasks
  for all using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));

-- group_messages không có cột user_id (chỉ có sender_id) — cùng lỗi như trên.
drop policy if exists group_messages_all on public.group_messages;
create policy group_messages_all on public.group_messages
  for all using (public.is_group_member(group_id, auth.uid()))
  with check (public.is_group_member(group_id, auth.uid()));
