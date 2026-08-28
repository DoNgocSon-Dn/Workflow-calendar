-- Thùng rác (soft delete) cho GHI CHÚ — "Xóa" một ghi chú chỉ set deleted_at
-- thay vì xoá hẳn khỏi bảng, cho phép khôi phục lại trong mục "Thùng rác ghi
-- chú". Chạy 1 lần trong Supabase SQL Editor. An toàn khi chạy lại nhiều lần.
--
-- Giống hệt cách events đã làm ở 0004_events_trash.sql.

alter table public.notes
  add column if not exists deleted_at timestamptz;

-- Danh sách ghi chú (GET /notes) chỉ lấy deleted_at is null — index này giúp
-- truy vấn đó (và cả truy vấn thùng rác) nhanh hơn.
create index if not exists notes_not_deleted_idx
  on public.notes (user_id, created_at desc)
  where deleted_at is null;

-- RLS: xoá mềm / khôi phục đi qua UPDATE, xoá vĩnh viễn qua DELETE — policy
-- notes_all_own (for all using user_id = auth.uid()) ở 0003 đã cho phép cả
-- hai. Không cần policy mới.
