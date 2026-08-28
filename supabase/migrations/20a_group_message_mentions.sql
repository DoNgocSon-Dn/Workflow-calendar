-- Mention trong chat nhóm: lưu METADATA thay vì chỉ dựa vào việc dò chuỗi
-- "@tên" trong nội dung sau khi tin nhắn đã gửi.
--
-- Vì sao cần cột riêng: dò text không phân biệt được "@Sơn" là mention thật
-- hay chỉ là chữ trong câu, không biết userId nào ứng với tên đó (hai người
-- trùng tên là hỏng), và vỡ hoàn toàn khi người được nhắc đổi tên hiển thị.
-- Có metadata thì client biết chính xác ai được nhắc để bắn thông báo và tô
-- màu, không phải đoán.
--
-- Hình dạng dữ liệu (jsonb array, có thể null với tin nhắn cũ):
--   [{"type":"user","userId":"<uuid>","label":"Quốc Cường"}]
--   [{"type":"all","label":"All"}]
-- `label` là tên hiển thị TẠI THỜI ĐIỂM GỬI — giữ nguyên để tô đúng đoạn chữ
-- trong nội dung kể cả sau khi người đó đổi tên.
--
-- Kiểu hàng trả về của 3 RPC đổi (thêm cột mentions) nên create or replace
-- KHÔNG đủ — Postgres báo 42P13 — phải drop trước, giống 14_group_messages_sender_name.sql.
--
-- Chạy 1 lần trong Supabase SQL Editor, sau 14_group_messages_sender_name.sql.

alter table public.group_messages
  add column if not exists mentions jsonb;

drop function if exists public.list_group_messages(uuid);
drop function if exists public.edit_group_message(uuid, text);
drop function if exists public.delete_group_message(uuid);

create or replace function public.list_group_messages(p_group_id uuid)
returns table (
  id uuid, group_id uuid, sender_id uuid, message text, created_at timestamptz,
  edited_at timestamptz, deleted_at timestamptz,
  attachment_url text, attachment_name text, attachment_type text, attachment_size bigint,
  sender_email text, sender_name text, mentions jsonb
)
language plpgsql
security definer set search_path = public
as $$
begin
  if not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'not authorized';
  end if;

  return query
    select gmsg.id, gmsg.group_id, gmsg.sender_id, gmsg.message, gmsg.created_at,
           gmsg.edited_at, gmsg.deleted_at,
           gmsg.attachment_url, gmsg.attachment_name, gmsg.attachment_type, gmsg.attachment_size,
           u.email::text, u.raw_user_meta_data->>'full_name', gmsg.mentions
    from public.group_messages gmsg
    join auth.users u on u.id = gmsg.sender_id
    where gmsg.group_id = p_group_id
    order by gmsg.created_at asc;
end;
$$;

create or replace function public.edit_group_message(p_message_id uuid, p_message text)
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
  v_sender uuid;
  v_deleted timestamptz;
begin
  select gmsg.sender_id, gmsg.deleted_at into v_sender, v_deleted
  from public.group_messages gmsg where gmsg.id = p_message_id;

  if v_sender is null then
    raise exception 'message not found';
  end if;
  if v_sender <> auth.uid() then
    raise exception 'not authorized';
  end if;
  if v_deleted is not null then
    raise exception 'message already deleted';
  end if;
  if p_message is null or length(trim(p_message)) = 0 then
    raise exception 'message must not be empty';
  end if;

  update public.group_messages gmsg
  set message = p_message, edited_at = now()
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

  if v_sender <> auth.uid() then
    select gm.role into v_role
    from public.group_members gm
    where gm.group_id = v_group_id and gm.user_id = auth.uid();

    if v_role is null or v_role not in ('owner', 'admin') then
      raise exception 'not authorized';
    end if;
  end if;

  -- Xoá luôn mentions: tin đã xoá thì không còn nhắc tới ai nữa, giữ lại chỉ
  -- khiến giao diện tô màu một nội dung không còn tồn tại.
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
