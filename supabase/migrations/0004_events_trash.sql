-- Thùng rác (soft delete) cho events — xoá sẽ chỉ set deleted_at thay vì xoá
-- hẳn khỏi bảng, cho phép khôi phục. Chạy 1 lần trong Supabase SQL Editor,
-- SAU khi đã chạy schema.sql + 0002 + 0003.

alter table public.events
  add column if not exists deleted_at timestamptz;

-- Danh sách sự kiện trong lịch (findAll/checkConflicts) chỉ cần lọc theo
-- deleted_at is null — index này giúp truy vấn đó nhanh hơn.
create index if not exists events_not_deleted_idx
  on public.events (calendar_id, start_at)
  where deleted_at is null;

-- RLS: soft-delete/khôi phục đi qua UPDATE nên đã được policy
-- events_update_editor (đã tạo ở schema.sql) cho phép; xoá vĩnh viễn vẫn
-- dùng policy events_delete_editor sẵn có. Không cần policy mới.
