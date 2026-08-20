-- Mời bạn bè tham gia group (calendar) — thông báo realtime qua Socket.IO ở
-- tầng backend (RealtimeGateway.emitToUser/emitToCalendar); migration này chỉ
-- lo phần dữ liệu + RLS. Chạy 1 lần trong Supabase SQL Editor, SAU khi đã
-- chạy schema.sql + 0002 (cần find_user_id_by_email) + các migration trước.

create table if not exists public.calendar_invites (
  id              uuid primary key default gen_random_uuid(),
  calendar_id     uuid not null references public.calendars(id) on delete cascade,
  invited_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by      uuid references auth.users(id) on delete set null,
  role            text not null default 'viewer'
                  check (role in ('editor','viewer')),
  status          text not null default 'pending'
                  check (status in ('pending','accepted','declined')),
  created_at      timestamptz not null default now(),
  unique (calendar_id, invited_user_id)
);

alter table public.calendar_invites enable row level security;

-- Người được mời thấy lời mời của chính mình; owner/editor thấy lời mời đã gửi đi
drop policy if exists calendar_invites_select on public.calendar_invites;
create policy calendar_invites_select on public.calendar_invites
  for select using (
    invited_user_id = auth.uid()
    or public.is_calendar_editor_or_owner(calendar_id, auth.uid())
  );

-- Chỉ owner/editor được mời người khác, và phải đứng tên người mời
drop policy if exists calendar_invites_insert on public.calendar_invites;
create policy calendar_invites_insert on public.calendar_invites
  for insert with check (
    invited_by = auth.uid()
    and public.is_calendar_editor_or_owner(calendar_id, auth.uid())
  );

-- Owner/editor có thể huỷ lời mời đã gửi (chưa được phản hồi)
drop policy if exists calendar_invites_delete on public.calendar_invites;
create policy calendar_invites_delete on public.calendar_invites
  for delete using (public.is_calendar_editor_or_owner(calendar_id, auth.uid()));

-- ============================================================
-- Danh sách lời mời của chính mình, kèm tên lịch + email người mời — cần
-- SECURITY DEFINER vì phải join qua auth.users (giống list_event_attendees).
-- ============================================================
create or replace function public.list_my_calendar_invites()
returns table (
  id uuid,
  calendar_id uuid,
  calendar_name text,
  calendar_color text,
  invited_by uuid,
  inviter_email text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
begin
  return query
    select ci.id, ci.calendar_id, c.name, c.color, ci.invited_by,
           u.email::text, ci.role, ci.status, ci.created_at
    from public.calendar_invites ci
    join public.calendars c on c.id = ci.calendar_id
    left join auth.users u on u.id = ci.invited_by
    where ci.invited_user_id = auth.uid()
    order by ci.created_at desc;
end;
$$;

-- ============================================================
-- Trả lời lời mời: đổi status + (nếu accept) thêm vào calendar_members trong
-- 1 giao dịch. SECURITY DEFINER vì calendar_members_insert_self_owner (ở
-- schema.sql) chỉ cho phép user tự thêm mình với role 'owner' — người được
-- mời join với role viewer/editor nên phải bypass RLS có kiểm soát ở đây.
-- Trả về kèm tên lịch (join bypass RLS) vì nếu status = declined, người gọi
-- không phải member nên calendars_select_member sẽ chặn 1 select thường.
-- ============================================================
create or replace function public.respond_calendar_invite(p_invite_id uuid, p_status text)
returns table (
  id uuid,
  calendar_id uuid,
  calendar_name text,
  calendar_color text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
declare
  inv public.calendar_invites;
begin
  if p_status not in ('accepted', 'declined') then
    raise exception 'invalid status';
  end if;

  select * into inv from public.calendar_invites
  where calendar_invites.id = p_invite_id and invited_user_id = auth.uid();

  if not found then
    raise exception 'invite not found';
  end if;

  update public.calendar_invites ci
  set status = p_status
  where ci.id = p_invite_id
  returning * into inv;

  if p_status = 'accepted' then
    insert into public.calendar_members (calendar_id, user_id, role)
    values (inv.calendar_id, auth.uid(), inv.role)
    on conflict (calendar_id, user_id) do nothing;
  end if;

  return query
    select inv.id, inv.calendar_id, c.name, c.color, inv.role, inv.status, inv.created_at
    from public.calendars c
    where c.id = inv.calendar_id;
end;
$$;
