-- Sự kiện lặp lại (recurring events). Không dựng bảng "rule" riêng hay expand
-- ảo lúc query: mỗi lần lặp được vật chất hoá thành một hàng events thật
-- (giới hạn 180 lần hoặc 2 năm, xem RECURRENCE_MAX_OCCURRENCES/HORIZON_YEARS
-- trong backend/src/events/recurrence.util.ts) — nhờ vậy reminders/attendees/
-- comments vẫn khoá vào đúng một event_id như cũ, và findAll()/frontend
-- không cần đổi gì để hiển thị.
--
-- series_id KHÔNG phải khoá ngoại tới chính bảng events — chỉ là một UUID
-- dùng chung để nhóm các hàng cùng một chuỗi lặp lại với nhau. recurrence_rule
-- được lưu lặp lại (denormalized) trên MỌI hàng trong chuỗi, để mở sửa bất kỳ
-- lần lặp nào cũng biết ngay quy tắc lặp mà không cần truy vấn thêm.
--
-- An toàn khi chạy lại nhiều lần.

alter table public.events
  add column if not exists series_id uuid,
  add column if not exists recurrence_rule jsonb;

create index if not exists events_series_id_idx
  on public.events (series_id)
  where series_id is not null;
