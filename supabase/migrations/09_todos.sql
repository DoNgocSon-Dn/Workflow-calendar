-- Việc cần làm (to-do list) — cá nhân, độc lập với event/calendar, cùng mẫu với notes.
-- Chạy 1 lần trong Supabase SQL Editor.

create table if not exists public.todos (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  content    text not null,
  done       boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists todos_set_updated_at on public.todos;
create trigger todos_set_updated_at
before update on public.todos
for each row execute function public.set_updated_at();

alter table public.todos enable row level security;

drop policy if exists todos_all_own on public.todos;
create policy todos_all_own on public.todos
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists todos_user_created_idx on public.todos (user_id, created_at desc);
