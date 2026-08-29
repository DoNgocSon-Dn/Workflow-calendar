-- Migration 38: Bảng lưu trữ điều ước hàng năm (Time Capsule Birthday Wishes)

create table if not exists public.birthday_wishes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wish_year integer not null,
  wish_text text not null check (char_length(trim(wish_text)) > 0),
  status text not null default 'pending' check (status in ('pending', 'completed', 'in_progress', 'retry')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  unique (user_id, wish_year)
);

alter table public.birthday_wishes enable row level security;

drop policy if exists "Users can manage their own birthday wishes" on public.birthday_wishes;
create policy "Users can manage their own birthday wishes"
  on public.birthday_wishes for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create or replace function public.get_pending_wish_for_review(p_current_year integer)
returns table (
  id uuid,
  wish_year integer,
  wish_text text,
  status text,
  created_at timestamptz
) as $$
begin
  return query
  select w.id, w.wish_year, w.wish_text, w.status, w.created_at
  from public.birthday_wishes w
  where w.user_id = auth.uid()
    and w.wish_year = (p_current_year - 1)
    and w.status = 'pending'
  limit 1;
end;
$$ language plpgsql security definer;
