-- Lời mời tham gia NHÓM (pending/accepted/declined) + bảng chống gửi trùng cho
-- cron deadline của task. Thông báo realtime do backend phát qua Socket.IO
-- (RealtimeGateway.emitToUser); migration này chỉ lo dữ liệu + RLS.
--
-- Chạy 1 lần trong Supabase SQL Editor, SAU khi đã chạy:
--   schema.sql → 0002 (find_user_id_by_email) → 02_groups_workspace.sql
--   (cần is_group_member) → các migration còn lại.
--
-- Thiết kế bám sát 0006_calendar_invites.sql để hai luồng mời (lịch và nhóm)
-- hoạt động giống hệt nhau.

-- ============================================================
-- 1. Lời mời tham gia nhóm
-- ============================================================
create table if not exists public.group_invites (
  id              uuid primary key default gen_random_uuid(),
  group_id        uuid not null references public.groups(id) on delete cascade,
  invited_user_id uuid not null references auth.users(id) on delete cascade,
  invited_by      uuid references auth.users(id) on delete set null,
  role            text not null default 'member'
                  check (role in ('admin','member','guest')),
  status          text not null default 'pending'
                  check (status in ('pending','accepted','declined')),
  created_at      timestamptz not null default now(),
  unique (group_id, invited_user_id)
);

alter table public.group_invites enable row level security;

-- Người được mời thấy lời mời của mình; thành viên nhóm thấy lời mời đã gửi đi
drop policy if exists group_invites_select on public.group_invites;
create policy group_invites_select on public.group_invites
  for select using (
    invited_user_id = auth.uid()
    or public.is_group_member(group_id, auth.uid())
  );

-- Chỉ thành viên nhóm được mời người khác, và phải đứng tên người mời
drop policy if exists group_invites_insert on public.group_invites;
create policy group_invites_insert on public.group_invites
  for insert with check (
    invited_by = auth.uid()
    and public.is_group_member(group_id, auth.uid())
  );

-- Thành viên nhóm có thể thu hồi lời mời đã gửi
drop policy if exists group_invites_delete on public.group_invites;
create policy group_invites_delete on public.group_invites
  for delete using (public.is_group_member(group_id, auth.uid()));

-- ============================================================
-- Danh sách lời mời nhóm của chính mình, kèm tên nhóm + email người mời.
-- SECURITY DEFINER vì phải join qua auth.users và qua groups (người được mời
-- chưa phải member nên groups_select_member sẽ chặn select thường).
-- ============================================================
create or replace function public.list_my_group_invites()
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_color text,
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
    select gi.id, gi.group_id, g.name, g.color, gi.invited_by,
           u.email::text, gi.role, gi.status, gi.created_at
    from public.group_invites gi
    join public.groups g on g.id = gi.group_id
    left join auth.users u on u.id = gi.invited_by
    where gi.invited_user_id = auth.uid()
    order by gi.created_at desc;
end;
$$;

-- ============================================================
-- Trả lời lời mời nhóm: đổi status + (nếu accept) thêm vào group_members và
-- calendar_members của lịch nhóm, trong 1 giao dịch.
-- SECURITY DEFINER vì người được mời chưa phải member nên chưa qua được
-- group_members_insert / calendar_members RLS.
-- ============================================================
create or replace function public.respond_group_invite(p_invite_id uuid, p_status text)
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  group_color text,
  role text,
  status text,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
declare
  inv public.group_invites;
  grp public.groups;
begin
  if p_status not in ('accepted', 'declined') then
    raise exception 'invalid status';
  end if;

  select * into inv from public.group_invites
  where group_invites.id = p_invite_id and invited_user_id = auth.uid();

  if not found then
    raise exception 'invite not found';
  end if;

  if inv.status <> 'pending' then
    raise exception 'invite already handled';
  end if;

  update public.group_invites gi
  set status = p_status
  where gi.id = p_invite_id
  returning * into inv;

  select * into grp from public.groups where groups.id = inv.group_id;

  if p_status = 'accepted' then
    insert into public.group_members (group_id, user_id, role)
    values (inv.group_id, auth.uid(), inv.role)
    on conflict (group_id, user_id) do nothing;

    -- Vào nhóm thì cũng vào lịch của nhóm, khớp cách inviteMember cũ đang làm.
    if grp.calendar_id is not null then
      insert into public.calendar_members (calendar_id, user_id, role)
      values (
        grp.calendar_id,
        auth.uid(),
        case when inv.role = 'admin' then 'editor' else 'viewer' end
      )
      on conflict (calendar_id, user_id) do nothing;
    end if;
  end if;

  return query
    select inv.id, inv.group_id, grp.name, grp.color, inv.role, inv.status, inv.created_at;
end;
$$;

-- ============================================================
-- 2. Chống gửi trùng thông báo deadline
-- Cron chạy mỗi phút; bảng này ghi lại "task X đã bắn mốc Y rồi" để một task
-- quá hạn không bắn lại thông báo mỗi phút.
-- ============================================================
create table if not exists public.task_deadline_notifications (
  id         uuid primary key default gen_random_uuid(),
  task_id    uuid not null references public.group_tasks(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  phase      text not null check (phase in ('upcoming','due','overdue')),
  created_at timestamptz not null default now(),
  unique (task_id, user_id, phase)
);

alter table public.task_deadline_notifications enable row level security;

-- Chỉ người nhận đọc được; ghi là việc của service-role (cron), không qua RLS.
drop policy if exists task_deadline_notifications_select on public.task_deadline_notifications;
create policy task_deadline_notifications_select on public.task_deadline_notifications
  for select using (user_id = auth.uid());

-- ============================================================
-- 3. Task của chính mình trên MỌI nhóm — để Notification Center theo dõi
-- deadline mà không cần mở từng nhóm.
-- ============================================================
create or replace function public.list_my_group_tasks()
returns table (
  id uuid,
  group_id uuid,
  group_name text,
  title text,
  description text,
  status text,
  assigned_to uuid,
  due_date timestamptz,
  created_by uuid,
  created_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
begin
  return query
    select t.id, t.group_id, g.name, t.title, t.description, t.status,
           t.assigned_to, t.due_date, t.created_by, t.created_at
    from public.group_tasks t
    join public.groups g on g.id = t.group_id
    where t.assigned_to = auth.uid()
    order by t.due_date nulls last, t.created_at desc;
end;
$$;
