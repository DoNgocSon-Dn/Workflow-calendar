-- Migration 30: Backfill 1 lần cho Lịch Nhóm.
--
-- Backend (groups.service.ts) từ nay đồng bộ calendar_members bằng service-role
-- cho MỌI thay đổi thành viên/quyền/chuyển-quyền. Migration này sửa dữ liệu
-- ĐÃ LỆCH từ trước bản vá đó:
--   - thành viên nhóm còn kẹt 'viewer' -> không tạo được sự kiện chung
--   - lịch nhóm còn "chủ" là người tạo cũ sau khi đã chuyển quyền trưởng nhóm
--
-- Idempotent, chỉ UPDATE/INSERT dữ liệu lệch. Chạy SAU 28 & 29 trong
-- Supabase Dashboard > SQL Editor.

begin;

-- ------------------------------------------------------------
-- 1. Mọi thành viên nhóm đều được tạo sự kiện chung
--    (trước đây RPC gán 'admin' -> editor, còn lại -> viewer, trái với
--     mô tả "Tất cả thành viên đều có quyền theo dõi và tạo sự kiện chung").
--    Không đụng chủ lịch.
-- ------------------------------------------------------------
update public.calendar_members cm
set role = 'editor'
from public.groups g
where g.calendar_id = cm.calendar_id
  and cm.role = 'viewer'
  and exists (
    select 1 from public.group_members gm
    where gm.group_id = g.id and gm.user_id = cm.user_id
  );

-- ------------------------------------------------------------
-- 2. Chủ sở hữu LỊCH nhóm phải là trưởng nhóm hiện tại.
--    transfer_group_leadership (migration 15) chỉ đổi groups.owner_id, để
--    calendars.owner_id + calendar_members kẹt ở người tạo nhóm đầu tiên.
-- ------------------------------------------------------------

-- 2a. Cột calendars.owner_id (dùng ở canEdit và RLS xoá lịch).
update public.calendars c
set owner_id = g.owner_id
from public.groups g
where g.calendar_id = c.id
  and c.owner_id is distinct from g.owner_id;

-- 2b. Chủ lịch cũ (không còn là trưởng nhóm) -> editor.
update public.calendar_members cm
set role = 'editor'
from public.groups g
where g.calendar_id = cm.calendar_id
  and cm.role = 'owner'
  and cm.user_id <> g.owner_id;

-- 2c. Trưởng nhóm hiện tại -> owner của lịch nhóm.
update public.calendar_members cm
set role = 'owner'
from public.groups g
where g.calendar_id = cm.calendar_id
  and cm.user_id = g.owner_id
  and cm.role is distinct from 'owner';

-- 2d. Trưởng nhóm hiện tại chưa có hàng calendar_members nào (hiếm) -> thêm.
insert into public.calendar_members (calendar_id, user_id, role)
select g.calendar_id, g.owner_id, 'owner'
from public.groups g
where g.calendar_id is not null
  and not exists (
    select 1 from public.calendar_members cm
    where cm.calendar_id = g.calendar_id and cm.user_id = g.owner_id
  );

commit;

-- ------------------------------------------------------------
-- 3. (TUỲ CHỌN) Tìm lịch nhóm MỒ CÔI — nhóm đã xoá nhưng lịch còn lại kèm
--    sự kiện/thành viên. Chạy SELECT trước, tự xác nhận rồi mới xoá.
--
--   select c.* from public.calendars c
--   where c.name like '%(Lịch nhóm)%'
--     and not exists (select 1 from public.groups g where g.calendar_id = c.id);
--
--   -- sau khi kiểm tra:
--   -- delete from public.calendars c
--   -- where c.name like '%(Lịch nhóm)%'
--   --   and not exists (select 1 from public.groups g where g.calendar_id = c.id);
-- ------------------------------------------------------------
