-- respond_group_invite() RETURNS TABLE(..., group_id uuid, ...) — mỗi cột
-- trong RETURNS TABLE tự động trở thành 1 biến plpgsql cùng tên trong toàn bộ
-- thân hàm. Từ Postgres 9.5, ON CONFLICT (cột) chấp nhận cú pháp dạng biểu
-- thức (để hỗ trợ expression index) nên "group_id" trong
-- "on conflict (group_id, user_id)" bị parser coi là biểu thức, và ambiguous
-- giữa cột group_members.group_id với biến group_id (OUT param) — lỗi
-- "column reference group_id is ambiguous", chặn MỌI accept/decline lời mời
-- nhóm (không phải lỗi ở phía client).
--
-- Vá bằng pragma #variable_conflict use_column: mọi tham chiếu tên trùng cột
-- ưu tiên hiểu là CỘT thay vì biến — đúng ý ở mọi chỗ trong hàm này (biến OUT
-- chỉ được đọc qua inv.group_id/inv.id..., chưa bao giờ cần đọc trần).
-- Không đổi RETURNS TABLE nên không cần drop function trước.
--
-- respond_calendar_invite() (0006_calendar_invites.sql) dính CHÍNH XÁC lỗi
-- tương tự — RETURNS TABLE có cột calendar_id, "on conflict (calendar_id,
-- user_id)" cũng ambiguous — vá luôn trong cùng migration này vì cùng
-- nguyên nhân gốc, cùng lúc chạy.
--
-- Chạy 1 lần trong Supabase SQL Editor, sau 07_group_invites_and_deadlines.sql
-- và 0006_calendar_invites.sql.

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
