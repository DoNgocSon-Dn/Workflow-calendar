-- Migration 33: Lịch Nhóm — thành viên thường CHỈ XEM.
--
-- Đổi chính sách: chỉ Trưởng nhóm (LEADER) và Phó nhóm (ADMIN) được thêm/sửa/
-- xoá sự kiện trong Lịch Nhóm; Thành viên thường chỉ theo dõi.
--
-- Trước đây (migration 30 §1) mọi thành viên nhóm đều được nâng lên 'editor'.
-- Migration này hạ những người KHÔNG phải leader/admin về 'viewer'. Backend
-- (groups.service.ts) từ nay cũng gán quyền lịch theo vai trò nhóm và tự đồng
-- bộ khi mở workspace.
--
-- Idempotent — chỉ UPDATE hàng lệch, không đụng 'owner'. Chạy trong Supabase
-- Dashboard > SQL Editor.

update public.calendar_members cm
set role = 'viewer'
from public.groups g
join public.group_members gm
  on gm.group_id = g.id and gm.user_id = cm.user_id
where g.calendar_id = cm.calendar_id
  and cm.role = 'editor'
  and cm.user_id <> g.owner_id
  and lower(coalesce(gm.role, 'member')) not in ('leader', 'owner', 'admin');
