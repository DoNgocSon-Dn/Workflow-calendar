-- Migration: chuẩn hoá vai trò nhóm về LEADER / ADMIN / MEMBER
--
-- 1. Đổi 'owner' -> 'leader' (giao diện gọi là "Trưởng nhóm", không dùng OWNER).
-- 2. Gộp 'guest' -> 'member' (bỏ hẳn vai trò Khách khỏi mô hình nhóm).
-- 3. Cập nhật hàm kiểm duyệt tin nhắn — nó đang so sánh với 'owner'.
-- 4. Siết RLS: trước đây BẤT KỲ thành viên nào cũng xoá được BẤT KỲ ai — kể cả
--    trưởng nhóm — vì policy delete chỉ kiểm tra "có phải thành viên không".
--
-- CHỈ đụng tới vai trò trong NHÓM (group_members / group_invites).
-- KHÔNG đụng tới calendar_members, nơi 'owner' là một vai trò khác hẳn thuộc
-- bộ ('owner','editor','viewer') và vẫn giữ nguyên.
--
-- An toàn khi chạy lại nhiều lần.

begin;

-- ---------------------------------------------------------------------------
-- 1. Dữ liệu: nới ràng buộc -> đổi giá trị -> siết lại ràng buộc
-- ---------------------------------------------------------------------------

-- Gỡ MỌI ràng buộc CHECK đang nằm trên cột role của hai bảng này, thay vì đoán
-- đúng một cái tên. Ràng buộc khai báo inline được Postgres tự đặt tên, và nếu
-- bảng từng được tạo lại thì tên có thể là group_members_role_check1 — khi đó
-- "drop constraint if exists <tên đoán>" im lặng không làm gì, rồi lệnh UPDATE
-- bên dưới mới thất bại.
do $$
declare
  r record;
begin
  for r in
    select rel.relname as tbl, con.conname as name
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public'
      and rel.relname in ('group_members', 'group_invites')
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%role%'
  loop
    execute format('alter table public.%I drop constraint %I', r.tbl, r.name);
  end loop;
end $$;

update public.group_members set role = 'leader' where role = 'owner';
update public.group_members set role = 'member' where role = 'guest';

-- Bất kỳ giá trị lạ nào còn sót lại đều hạ về cấp thấp nhất, để câu ADD
-- CONSTRAINT bên dưới không thất bại giữa chừng trên dữ liệu thật.
update public.group_members
  set role = 'member'
  where role not in ('leader', 'admin', 'member');

-- Lời mời chỉ còn hai vai trò gán được: không ai được mời thẳng làm trưởng nhóm.
update public.group_invites
  set role = 'member'
  where role not in ('admin', 'member');

alter table public.group_members
  add constraint group_members_role_check
  check (role in ('leader', 'admin', 'member'));

alter table public.group_invites
  add constraint group_invites_role_check
  check (role in ('admin', 'member'));

-- ---------------------------------------------------------------------------
-- 2. Đồng bộ: trưởng nhóm luôn phải có hàng thành viên với role 'leader'
-- ---------------------------------------------------------------------------

-- groups.owner_id là nguồn xác định ai lãnh đạo nhóm; hàng trong
-- group_members chỉ là bản sao để truy vấn cho nhanh. Nếu hai chỗ lệch nhau
-- thì kiểm tra quyền sẽ ra kết quả khác nhau tuỳ đường đi, nên ép chúng khớp.
update public.group_members gm
  set role = 'leader'
  from public.groups g
  where g.id = gm.group_id
    and g.owner_id = gm.user_id
    and gm.role <> 'leader';

-- Ngược lại: không ai ngoài owner_id được mang role 'leader'.
update public.group_members gm
  set role = 'admin'
  from public.groups g
  where g.id = gm.group_id
    and g.owner_id <> gm.user_id
    and gm.role = 'leader';

-- ---------------------------------------------------------------------------
-- 3. Hàm trợ giúp: vai trò hiệu lực của một người trong một nhóm
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER để policy tự truy vấn được group_members mà không kích
-- hoạt lại chính policy đó (đệ quy vô hạn).
create or replace function public.group_role_of(p_group_id uuid, p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1 from public.groups g
      where g.id = p_group_id and g.owner_id = p_user_id
    ) then 'leader'
    else coalesce(
      (select gm.role from public.group_members gm
        where gm.group_id = p_group_id and gm.user_id = p_user_id),
      'none'
    )
  end;
$$;

create or replace function public.group_role_rank(p_role text)
returns int
language sql
immutable
as $$
  select case p_role
    when 'leader' then 3
    when 'admin'  then 2
    when 'member' then 1
    else 0
  end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Hàm kiểm duyệt tin nhắn: 'owner' -> 'leader'
-- ---------------------------------------------------------------------------

-- BẮT BUỘC phải cập nhật cùng lúc với việc đổi dữ liệu. delete_group_message
-- (migration 14) kiểm tra `v_role not in ('owner','admin')`; sau khi hàng của
-- trưởng nhóm mang giá trị 'leader', điều kiện đó sẽ luôn sai và trưởng nhóm
-- MẤT quyền xoá tin nhắn của người khác trong chính nhóm mình.
--
-- Dùng group_role_of() thay vì đọc thẳng cột role, để hàm này và RLS ở mục 5
-- cùng dựa trên một định nghĩa "vai trò hiệu lực" duy nhất.
create or replace function public.delete_group_message(p_message_id uuid)
returns table (
  id uuid, group_id uuid, sender_id uuid, message text, created_at timestamptz,
  edited_at timestamptz, deleted_at timestamptz,
  attachment_url text, attachment_name text, attachment_type text, attachment_size bigint,
  sender_email text, sender_name text
)
language plpgsql
security definer set search_path = public
as $$
declare
  v_group_id uuid;
  v_sender uuid;
  v_role text;
begin
  select gmsg.group_id, gmsg.sender_id into v_group_id, v_sender
  from public.group_messages gmsg where gmsg.id = p_message_id;

  if v_group_id is null then
    raise exception 'message not found';
  end if;

  -- Người gửi luôn xoá được tin của chính mình; ngoài ra phải từ quản trị viên
  -- trở lên.
  if v_sender <> auth.uid() then
    v_role := public.group_role_of(v_group_id, auth.uid());
    if public.group_role_rank(v_role) < public.group_role_rank('admin') then
      raise exception 'not authorized';
    end if;
  end if;

  update public.group_messages gmsg
  set deleted_at = now(), message = null,
      attachment_url = null, attachment_name = null, attachment_type = null, attachment_size = null
  where gmsg.id = p_message_id;

  return query
    select gmsg.id, gmsg.group_id, gmsg.sender_id, gmsg.message, gmsg.created_at,
           gmsg.edited_at, gmsg.deleted_at,
           gmsg.attachment_url, gmsg.attachment_name, gmsg.attachment_type, gmsg.attachment_size,
           u.email::text, u.raw_user_meta_data->>'full_name'
    from public.group_messages gmsg
    join auth.users u on u.id = gmsg.sender_id
    where gmsg.id = p_message_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. RLS: chỉ cấp cao hơn mới đụng được cấp thấp hơn
-- ---------------------------------------------------------------------------

-- XOÁ: tự rời nhóm được (trừ trưởng nhóm — phải chuyển quyền trước), hoặc xoá
-- người có cấp THẤP HƠN mình. Policy cũ cho phép mọi thành viên xoá mọi người.
drop policy if exists group_members_delete on public.group_members;
create policy group_members_delete on public.group_members
  for delete using (
    (
      -- tự rời nhóm
      user_id = auth.uid()
      and public.group_role_of(group_id, auth.uid()) <> 'leader'
    )
    or (
      -- quản lý người cấp dưới
      public.group_role_rank(public.group_role_of(group_id, auth.uid()))
        > public.group_role_rank(public.group_role_of(group_id, user_id))
    )
  );

-- CẬP NHẬT: chỉ đổi được quyền của người có cấp THỰC SỰ thấp hơn, và không
-- đặt được ai thành 'leader' qua đường này.
--
-- Giữ dấu > (không phải >=) là có chủ đích: hai quản trị viên ngang cấp phải
-- không đụng được vào nhau. Việc chuyển quyền trưởng nhóm cần sửa hai hàng
-- cùng lúc nên KHÔNG đi qua policy này — nó có RPC riêng ở dưới.
drop policy if exists group_members_update on public.group_members;
create policy group_members_update on public.group_members
  for update using (
    public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      > public.group_role_rank(public.group_role_of(group_id, user_id))
  )
  with check (
    role in ('admin', 'member')
    and public.group_role_rank(public.group_role_of(group_id, auth.uid()))
      > public.group_role_rank(role)
  );

-- ---------------------------------------------------------------------------
-- 6. Chuyển quyền trưởng nhóm: một thao tác nguyên tử, một chốt kiểm tra
-- ---------------------------------------------------------------------------

-- Chuyển quyền phải đổi ba thứ cùng lúc (groups.owner_id, hàng của người
-- nhận, hàng của người giao). Làm bằng ba lệnh UPDATE rời từ client thì phải
-- nới policy ở trên xuống >= để chúng đi lọt — mà nới thế là mở đường cho một
-- quản trị viên hạ quyền quản trị viên khác.
--
-- SECURITY DEFINER gom cả ba vào một hàm: RLS không áp lên phần thân, nên
-- policy bên ngoài giữ được mức chặt nhất, và nếu có lỗi giữa chừng thì cả
-- hàm cùng rollback — nhóm không bao giờ rơi vào cảnh có hai trưởng nhóm hoặc
-- không có ai.
create or replace function public.transfer_group_leadership(
  p_group_id uuid,
  p_new_leader uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_owner uuid;
begin
  select g.owner_id into v_current_owner
  from public.groups g where g.id = p_group_id;

  if v_current_owner is null then
    raise exception 'group not found';
  end if;

  -- Chốt kiểm tra nằm TRONG hàm: hàm chạy với quyền chủ sở hữu nên không thể
  -- dựa vào RLS để chặn hộ.
  if v_current_owner <> auth.uid() then
    raise exception 'not authorized';
  end if;

  if p_new_leader = v_current_owner then
    raise exception 'already leader';
  end if;

  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = p_group_id and gm.user_id = p_new_leader
  ) then
    raise exception 'target is not a group member';
  end if;

  update public.groups set owner_id = p_new_leader where id = p_group_id;

  update public.group_members set role = 'leader'
    where group_id = p_group_id and user_id = p_new_leader;

  -- Người giao xuống quản trị viên, KHÔNG bị đẩy khỏi nhóm.
  update public.group_members set role = 'admin'
    where group_id = p_group_id and user_id = v_current_owner;
end;
$$;

-- THÊM: người tự nhận lời mời (hàng của chính mình), hoặc quản trị viên/trưởng
-- nhóm thêm người khác. Policy cũ cho phép mọi thành viên thêm bất kỳ ai.
drop policy if exists group_members_insert on public.group_members;
create policy group_members_insert on public.group_members
  for insert with check (
    user_id = auth.uid()
    or public.group_role_rank(public.group_role_of(group_id, auth.uid()))
       >= public.group_role_rank('admin')
  );

commit;
