-- Nhiều danh sách việc cần làm (kiểu Google Tasks) — mỗi user có N danh sách,
-- mỗi việc cần làm thuộc đúng 1 danh sách. Chạy 1 lần trong Supabase SQL Editor.

create table if not exists public.todo_lists (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  position   int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists todo_lists_set_updated_at on public.todo_lists;
create trigger todo_lists_set_updated_at
before update on public.todo_lists
for each row execute function public.set_updated_at();

alter table public.todo_lists enable row level security;

drop policy if exists todo_lists_all_own on public.todo_lists;
create policy todo_lists_all_own on public.todo_lists
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists todo_lists_user_position_idx on public.todo_lists (user_id, position);

-- Mỗi user có ít nhất 1 danh sách mặc định — backfill cho user đã có todos từ
-- trước khi khái niệm "danh sách" tồn tại.
insert into public.todo_lists (user_id, name, position)
select distinct t.user_id, 'Việc cần làm của tôi', 0
from public.todos t
where not exists (
  select 1 from public.todo_lists l where l.user_id = t.user_id
);

alter table public.todos add column if not exists list_id uuid references public.todo_lists(id) on delete cascade;

-- Gán todo cũ (chưa có list_id) vào danh sách mặc định vừa tạo cho đúng user đó.
update public.todos t
set list_id = l.id
from public.todo_lists l
where t.list_id is null
  and l.user_id = t.user_id
  and l.position = 0;

alter table public.todos alter column list_id set not null;

create index if not exists todos_list_idx on public.todos (list_id, created_at desc);
