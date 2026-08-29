-- Thả cảm xúc (reactions) cho tin nhắn chat nhóm.
--
-- Bảng riêng: mỗi (tin nhắn, người, emoji) là một hàng. Một người có thể thả
-- nhiều emoji khác nhau lên cùng một tin, nhưng mỗi emoji chỉ một lần (khoá
-- chính gộp 3 cột).
--
-- Chạy 1 lần trong Supabase SQL Editor, SAU 02_groups_workspace.sql
-- (cần group_messages, is_group_member). An toàn khi chạy lại.

create table if not exists public.group_message_reactions (
  message_id uuid not null references public.group_messages(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  emoji      text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

create index if not exists group_message_reactions_msg_idx
  on public.group_message_reactions (message_id);

alter table public.group_message_reactions enable row level security;

-- Xem: là thành viên của nhóm chứa tin nhắn đó.
drop policy if exists gmr_select on public.group_message_reactions;
create policy gmr_select on public.group_message_reactions
  for select using (
    exists (
      select 1 from public.group_messages m
      where m.id = group_message_reactions.message_id
        and public.is_group_member(m.group_id, auth.uid())
    )
  );

-- Thả / gỡ: chỉ hàng của chính mình, và phải là thành viên nhóm.
drop policy if exists gmr_insert on public.group_message_reactions;
create policy gmr_insert on public.group_message_reactions
  for insert with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.group_messages m
      where m.id = group_message_reactions.message_id
        and public.is_group_member(m.group_id, auth.uid())
    )
  );

drop policy if exists gmr_delete on public.group_message_reactions;
create policy gmr_delete on public.group_message_reactions
  for delete using (user_id = auth.uid());

-- Realtime (kênh dự phòng Supabase, cạnh Socket.IO).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'group_message_reactions'
  ) then
    alter publication supabase_realtime add table public.group_message_reactions;
  end if;
end $$;

-- Danh sách reaction của cả nhóm (gom theo tin + emoji) — nạp 1 lần khi mở chat.
create or replace function public.list_group_message_reactions(p_group_id uuid)
returns table (message_id uuid, emoji text, user_ids uuid[])
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
    select r.message_id, r.emoji, array_agg(r.user_id order by r.created_at)
    from public.group_message_reactions r
    join public.group_messages m on m.id = r.message_id
    where m.group_id = p_group_id
    group by r.message_id, r.emoji;
end;
$$;

revoke execute on function public.list_group_message_reactions(uuid) from anon;
