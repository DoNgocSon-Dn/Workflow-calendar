-- Thêm thời hạn (due date) và mô tả cho việc cần làm — cả hai đều tuỳ chọn.
-- Chạy 1 lần trong Supabase SQL Editor.

alter table public.todos add column if not exists due_at timestamptz;
alter table public.todos add column if not exists description text;

create index if not exists todos_due_at_idx on public.todos (due_at) where due_at is not null;
