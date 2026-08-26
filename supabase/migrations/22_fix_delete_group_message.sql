-- Fix: xoá tin nhắn chat nhóm (kể cả xoá tin của chính mình) luôn thất bại.
--
-- 1) group_messages_content_check (migration 04) bắt buộc mỗi hàng phải có
--    message không rỗng HOẶC attachment_url khác null. delete_group_message
--    (04, rồi 15, rồi 20) lại set CẢ HAI về null cùng lúc khi xoá mềm — mọi
--    lần gọi RPC này, kể cả người gửi tự xoá tin của mình, đều rơi vào lỗi
--    "new row for relation group_messages violates check constraint
--    group_messages_content_check" ngay từ migration 04. Tính năng này chưa
--    từng hoạt động được, không phải mới hỏng.
--    Fix: cho constraint biết một hàng ĐÃ XOÁ MỀM (deleted_at not null) được
--    phép trống cả hai.
--
-- 2) migration 20 (thêm cột mentions, phải drop+create lại hàm) vô tình dán
--    lại bản kiểm tra quyền CŨ `v_role not in ('owner','admin')` của migration
--    04/14, đè lên fix của migration 15 (dùng group_role_of/group_role_rank).
--    Từ khi vai trò 'owner' đổi thành 'leader', điều kiện cũ luôn đúng nên
--    trưởng nhóm mất quyền xoá tin nhắn của người khác. Khôi phục lại đúng
--    cách kiểm tra theo thứ hạng vai trò của migration 15.

alter table public.group_messages drop constraint if exists group_messages_content_check;
alter table public.group_messages add constraint group_messages_content_check
  check (
    deleted_at is not null
    or (message is not null and length(trim(message)) > 0)
    or attachment_url is not null
  );

create or replace function public.delete_group_message(p_message_id uuid)
returns table (
  id uuid, group_id uuid, sender_id uuid, message text, created_at timestamptz,
  edited_at timestamptz, deleted_at timestamptz,
  attachment_url text, attachment_name text, attachment_type text, attachment_size bigint,
  sender_email text, sender_name text, mentions jsonb
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

  -- Người gửi luôn xoá được tin của chính mình; ngoài ra phải từ quản trị
  -- viên trở lên (dùng group_role_of/group_role_rank như mục 5 của migration
  -- 15, không đọc thẳng cột role — chủ nhóm không có hàng trong group_members).
  if v_sender <> auth.uid() then
    v_role := public.group_role_of(v_group_id, auth.uid());
    if public.group_role_rank(v_role) < public.group_role_rank('admin') then
      raise exception 'not authorized';
    end if;
  end if;

  update public.group_messages gmsg
  set deleted_at = now(), message = null, mentions = null,
      attachment_url = null, attachment_name = null, attachment_type = null, attachment_size = null
  where gmsg.id = p_message_id;

  return query
    select gmsg.id, gmsg.group_id, gmsg.sender_id, gmsg.message, gmsg.created_at,
           gmsg.edited_at, gmsg.deleted_at,
           gmsg.attachment_url, gmsg.attachment_name, gmsg.attachment_type, gmsg.attachment_size,
           u.email::text, u.raw_user_meta_data->>'full_name', gmsg.mentions
    from public.group_messages gmsg
    join auth.users u on u.id = gmsg.sender_id
    where gmsg.id = p_message_id;
end;
$$;
