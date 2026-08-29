-- Tham gia nhóm bằng MÃ NGẮN + công tắc "yêu cầu phê duyệt".
--
-- Khác link mời (token UUID trong URL, migration 24): ở đây mỗi nhóm có một mã
-- ngắn dễ đọc/gõ tay (VD "K7F2Q9RM"). Người dùng nhập mã ở Dashboard:
--   • requires_approval = false → vào nhóm NGAY (kèm dòng chào trong chat),
--   • requires_approval = true  → tạo yêu cầu chờ Trưởng nhóm duyệt.
--
-- Chạy 1 lần trong Supabase SQL Editor, SAU 24_group_invite_links_and_join_requests.sql
-- (cần bảng group_join_requests, RPC approve_group_join_request, helpers
-- group_role_of / group_role_rank / is_group_member). An toàn khi chạy lại.

-- 1. Cột mới -----------------------------------------------------------------
alter table public.groups
  add column if not exists join_code text,
  add column if not exists requires_approval boolean not null default true;

-- 2. Sinh mã ngắn không lẫn ký tự (bỏ 0/O/1/I/L) --------------------------------
create or replace function public.gen_group_join_code()
returns text
language plpgsql
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  code text;
  i int;
begin
  loop
    code := '';
    for i in 1..8 loop
      code := code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.groups g where g.join_code = code);
  end loop;
  return code;
end;
$$;

-- 3. Backfill nhóm cũ + ép NOT NULL + unique ---------------------------------
update public.groups set join_code = public.gen_group_join_code()
where join_code is null;

alter table public.groups alter column join_code set not null;

create unique index if not exists groups_join_code_uidx on public.groups (join_code);

-- Nhóm mới tự có mã nếu client/service quên set.
alter table public.groups alter column join_code set default public.gen_group_join_code();

-- 4. RPC: tham gia bằng mã -------------------------------------------------------
-- SECURITY DEFINER vì người gọi CHƯA có quan hệ nào với nhóm (groups_select_member
-- chặn SELECT thường). Trả về outcome để service biết đường xử lý tiếp:
--   'joined'  → đã là thành viên, cần bắn group:memberJoined + dòng chào
--   'pending' → đã tạo yêu cầu, cần báo LEADER/ADMIN (request_id đi kèm)
create or replace function public.join_group_by_code(p_code text)
returns table (outcome text, group_id uuid, request_id uuid)
language plpgsql
security definer set search_path = public
as $$
declare
  grp public.groups;
  new_req public.group_join_requests;
begin
  select * into grp from public.groups g
  where upper(g.join_code) = upper(trim(p_code));

  if not found then
    raise exception 'group not found';
  end if;

  if public.is_group_member(grp.id, auth.uid()) then
    raise exception 'already a member';
  end if;

  if grp.requires_approval then
    if exists (
      select 1 from public.group_join_requests r
      where r.group_id = grp.id and r.user_id = auth.uid() and r.status = 'pending'
    ) then
      raise exception 'request already pending';
    end if;

    insert into public.group_join_requests (group_id, user_id, role, status)
    values (grp.id, auth.uid(), 'member', 'pending')
    returning * into new_req;

    return query select 'pending'::text, grp.id, new_req.id;
    return;
  end if;

  -- Vào thẳng: ghi group_members + calendar_members trong cùng giao dịch,
  -- cùng hình dạng với approve_group_join_request (migration 24).
  insert into public.group_members (group_id, user_id, role)
  values (grp.id, auth.uid(), 'member')
  on conflict (group_id, user_id) do nothing;

  if grp.calendar_id is not null then
    insert into public.calendar_members (calendar_id, user_id, role)
    values (grp.calendar_id, auth.uid(), 'viewer')
    on conflict (calendar_id, user_id) do nothing;
  end if;

  return query select 'joined'::text, grp.id, null::uuid;
end;
$$;

-- 5. RPC: xem lại mã của nhóm mình (LEADER/ADMIN) ---------------------------------
create or replace function public.get_group_join_code(p_group_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c text;
begin
  if public.group_role_rank(public.group_role_of(p_group_id, auth.uid()))
      < public.group_role_rank('admin') then
    raise exception 'not authorized';
  end if;
  select join_code into c from public.groups where id = p_group_id;
  return c;
end;
$$;

-- 6. RPC: tạo lại mã (LEADER/ADMIN) --------------------------------------------
create or replace function public.regenerate_group_join_code(p_group_id uuid)
returns text
language plpgsql
security definer set search_path = public
as $$
declare
  c text;
begin
  if public.group_role_rank(public.group_role_of(p_group_id, auth.uid()))
      < public.group_role_rank('admin') then
    raise exception 'not authorized';
  end if;
  c := public.gen_group_join_code();
  update public.groups set join_code = c where id = p_group_id;
  return c;
end;
$$;
