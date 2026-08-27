-- Áp lại respond_group_invite() / respond_calendar_invite() với bản vá
-- #variable_conflict use_column (migration 15_respond_group_invite_ambiguous_
-- column_fix). Nếu bản vá đó CHƯA được chạy trên DB cloud thì MỌI lần bấm
-- "Chấp nhận lời mời vào nhóm" đều lỗi:
--   column reference "group_id" is ambiguous
-- và NestJS trả 500 -> frontend hiện "Không thể xử lý lời mời. Vui lòng thử
-- lại." (không liên quan tới việc tắt/bật máy).
--
-- Idempotent: chỉ "create or replace function", không đụng bảng/dữ liệu.
-- Chạy 1 lần trong Supabase Dashboard > SQL Editor.

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
#variable_conflict use_column
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
#variable_conflict use_column
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
