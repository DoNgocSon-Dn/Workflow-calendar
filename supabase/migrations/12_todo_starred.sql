-- Gắn dấu sao cho việc cần làm (kiểu Google Tasks "Có gắn dấu sao").
-- Chạy 1 lần trong Supabase SQL Editor.

alter table public.todos add column if not exists starred boolean not null default false;

create index if not exists todos_starred_idx on public.todos (user_id, starred) where starred = true;
