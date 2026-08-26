-- Link mời tham gia nhóm (1 link tái sử dụng/nhóm, admin/leader duyệt yêu cầu).
--
-- Khác group_invites (mời đích danh 1 email đã biết, người mời phải biết
-- người được mời trước): ở đây admin/leader PHÁT HÀNH một token dùng chung,
-- ai có link cũng tự gửi được yêu cầu, rồi LEADER/ADMIN duyệt hoặc từ chối.
-- Hai luồng độc lập, không tái dùng group_invites để tránh phá vỡ ràng buộc
-- unique(group_id, invited_user_id) và các RPC hiện có của nó.
--
-- Chạy 1 lần trong Supabase SQL Editor, SAU 02_groups_workspace.sql (cần
-- is_group_member, groups) và 15_group_roles_leader.sql (cần group_role_of,
-- group_role_rank).

-- ============================================================
-- 1. Bảng
-- ============================================================
create table if not exists public.group_invite_links (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  token       uuid not null default gen_random_uuid(),
  role        text not null default 'member'
              check (role in ('admin','member','guest')),
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz,
  -- Chỉ một link ACTIVE (revoked_at is null) mỗi nhóm tại một thời điểm —
  -- "tạo lại" nghĩa là thu hồi link cũ rồi thêm link mới, không sửa tại chỗ,
  -- để giữ lại lịch sử token đã từng phát hành.
  unique (group_id, token)
);

-- Ép tối đa 1 link active/nhóm ở tầng DB, không chỉ ở tầng service — dùng
-- partial unique index vì ràng buộc "unique" thường không lọc theo điều kiện.
create unique index if not exists group_invite_links_one_active_per_group
  on public.group_invite_links (group_id)
  where revoked_at is null;

create table if not exists public.group_join_requests (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  link_id     uuid references public.group_invite_links(id) on delete set null,
  role        text not null default 'member'
              check (role in ('admin','member','guest')),
  status      text not null default 'pending'
              check (status in ('pending','approved','declined')),
  created_at  timestamptz not null default now(),
  decided_by  uuid references auth.users(id) on delete set null,
  decided_at  timestamptz
);

-- Một người chỉ có MỘT yêu cầu đang chờ cho cùng một nhóm tại một thời điểm —
-- nhưng gửi lại được sau khi bị từ chối, nên không unique toàn cục, chỉ khi
-- status = 'pending'.
create unique index if not exists group_join_requests_one_pending_per_user
  on public.group_join_requests (group_id, user_id)
  where status = 'pending';

alter table public.group_invite_links enable row level security;
alter table public.group_join_requests enable row level security;

-- ============================================================
-- 2. RLS
--
-- group_role_of()/group_role_rank() (migration 15) đã là SECURITY DEFINER và
-- tự bỏ qua RLS khi đọc group_members/groups bên trong, nên gọi chúng từ đây
-- KHÔNG tạo vòng đệ quy — cùng cách an toàn migration 15 đã dùng cho
-- group_members_update/group_members_delete.
-- ============================================================

-- Link: chỉ LEADER/ADMIN của nhóm xem/tạo/thu hồi được. MEMBER/GUEST không
-- thấy token.
drop policy if exists group_invite_links_select on public.group_invite_links;
create policy group_invite_links_select on public.group_invite_links
  for select using (
    public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      >= public.group_role_rank('admin')
  );

drop policy if exists group_invite_links_insert on public.group_invite_links;
create policy group_invite_links_insert on public.group_invite_links
  for insert with check (
    created_by = auth.uid()
    and public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      >= public.group_role_rank('admin')
  );

drop policy if exists group_invite_links_update on public.group_invite_links;
create policy group_invite_links_update on public.group_invite_links
  for update using (
    public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      >= public.group_role_rank('admin')
  );

-- Join requests: người yêu cầu thấy CHÍNH yêu cầu của mình (kể cả trước khi
-- là thành viên); LEADER/ADMIN thấy mọi yêu cầu của nhóm mình quản lý.
drop policy if exists group_join_requests_select on public.group_join_requests;
create policy group_join_requests_select on public.group_join_requests
  for select using (
    user_id = auth.uid()
    or public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      >= public.group_role_rank('admin')
  );

-- Cho user tự ghi hàng của mình qua client RLS bình thường — bước xem-trước
-- (chưa có hàng nào) và gửi yêu cầu vẫn đi qua RPC riêng bên dưới vì phải đọc
-- group_invite_links, mà bảng đó chỉ admin/leader SELECT được.
drop policy if exists group_join_requests_insert on public.group_join_requests;
create policy group_join_requests_insert on public.group_join_requests
  for insert with check (user_id = auth.uid());

-- Chỉ LEADER/ADMIN sửa (duyệt/từ chối). "Từ chối" chỉ đổi status, không đụng
-- bảng khác nên đi thẳng qua policy này, không cần RPC — "duyệt" thì phải qua
-- RPC approve_group_join_request vì còn phải ghi group_members +
-- calendar_members trong cùng một giao dịch.
drop policy if exists group_join_requests_update on public.group_join_requests;
create policy group_join_requests_update on public.group_join_requests
  for update using (
    public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      >= public.group_role_rank('admin')
  )
  with check (
    status in ('approved', 'declined')
    and public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      >= public.group_role_rank('admin')
  );

-- ============================================================
-- 3. Xem trước nhóm bằng token, TRƯỚC khi người dùng bấm "Gửi yêu cầu".
-- SECURITY DEFINER: người gọi đã đăng nhập nhưng chưa phải thành viên nên
-- groups_select_member sẽ chặn SELECT thường.
-- ============================================================
create or replace function public.get_group_invite_link_preview(p_token uuid)
returns table (
  group_id uuid,
  group_name text,
  group_description text,
  group_color text,
  role text,
  is_member boolean,
  my_pending_request_id uuid
)
language plpgsql
security definer set search_path = public
as $$
declare
  link public.group_invite_links;
begin
  select * into link from public.group_invite_links gil
  where gil.token = p_token and gil.revoked_at is null;

  if not found then
    raise exception 'link not found';
  end if;

  return query
    select g.id, g.name, g.description, g.color, link.role,
           public.is_group_member(g.id, auth.uid()),
           (select gjr.id from public.group_join_requests gjr
             where gjr.group_id = g.id and gjr.user_id = auth.uid()
               and gjr.status = 'pending')
    from public.groups g
    where g.id = link.group_id;
end;
$$;

-- ============================================================
-- 4. Gửi yêu cầu tham gia bằng token.
-- SECURITY DEFINER vì phải đọc group_invite_links (chỉ admin/leader SELECT
-- được theo policy ở mục 2) để xác thực token còn hiệu lực, trước khi người
-- gọi có bất kỳ quan hệ nào với nhóm.
-- ============================================================
create or replace function public.request_join_group(p_token uuid)
returns public.group_join_requests
language plpgsql
security definer set search_path = public
as $$
declare
  link public.group_invite_links;
  req public.group_join_requests;
begin
  select * into link from public.group_invite_links gil
  where gil.token = p_token and gil.revoked_at is null;

  if not found then
    raise exception 'link not found';
  end if;

  if public.is_group_member(link.group_id, auth.uid()) then
    raise exception 'already a member';
  end if;

  if exists (
    select 1 from public.group_join_requests gjr
    where gjr.group_id = link.group_id and gjr.user_id = auth.uid()
      and gjr.status = 'pending'
  ) then
    raise exception 'request already pending';
  end if;

  insert into public.group_join_requests (group_id, user_id, link_id, role, status)
  values (link.group_id, auth.uid(), link.id, link.role, 'pending')
  returning * into req;

  return req;
end;
$$;

-- ============================================================
-- 5. Duyệt yêu cầu tham gia: đổi status + thêm group_members + calendar_members
-- trong 1 giao dịch — cùng hình dạng với respond_group_invite (migration 07).
-- SECURITY DEFINER vì người duyệt đang ghi hàng THAY một người khác
-- (requester), điều mà group_members/calendar_members RLS không cho phép
-- qua client thường.
-- ============================================================
create or replace function public.approve_group_join_request(p_request_id uuid)
returns table (
  id uuid, group_id uuid, user_id uuid, role text, status text,
  created_at timestamptz, decided_by uuid, decided_at timestamptz
)
language plpgsql
security definer set search_path = public
as $$
declare
  req public.group_join_requests;
  grp public.groups;
  actor_rank int;
begin
  select * into req from public.group_join_requests gjr
  where gjr.id = p_request_id;

  if not found then
    raise exception 'request not found';
  end if;

  if req.status <> 'pending' then
    raise exception 'request already handled';
  end if;

  actor_rank := public.group_role_rank(public.group_role_of(req.group_id, auth.uid()));
  if actor_rank < public.group_role_rank('admin') then
    raise exception 'not authorized';
  end if;

  select * into grp from public.groups where groups.id = req.group_id;

  update public.group_join_requests gjr
  set status = 'approved', decided_by = auth.uid(), decided_at = now()
  where gjr.id = p_request_id
  returning * into req;

  insert into public.group_members (group_id, user_id, role)
  values (req.group_id, req.user_id, req.role)
  on conflict (group_id, user_id) do nothing;

  if grp.calendar_id is not null then
    insert into public.calendar_members (calendar_id, user_id, role)
    values (
      grp.calendar_id,
      req.user_id,
      case when req.role = 'admin' then 'editor' else 'viewer' end
    )
    on conflict (calendar_id, user_id) do nothing;
  end if;

  return query select req.id, req.group_id, req.user_id, req.role, req.status,
                       req.created_at, req.decided_by, req.decided_at;
end;
$$;

-- ============================================================
-- 6. Danh sách yêu cầu đang chờ của một nhóm, kèm email/tên người yêu cầu.
-- SECURITY DEFINER để join auth.users (client RLS không thấy bảng đó).
-- ============================================================
create or replace function public.list_group_join_requests(p_group_id uuid)
returns table (
  id uuid, group_id uuid, user_id uuid, role text, status text,
  created_at timestamptz, requester_email text, requester_name text
)
language plpgsql
security definer set search_path = public
as $$
begin
  if public.group_role_rank(public.group_role_of(p_group_id, auth.uid()))
      < public.group_role_rank('admin') then
    raise exception 'not authorized';
  end if;

  return query
    select gjr.id, gjr.group_id, gjr.user_id, gjr.role, gjr.status, gjr.created_at,
           u.email::text, u.raw_user_meta_data->>'full_name'
    from public.group_join_requests gjr
    join auth.users u on u.id = gjr.user_id
    where gjr.group_id = p_group_id and gjr.status = 'pending'
    order by gjr.created_at asc;
end;
$$;
