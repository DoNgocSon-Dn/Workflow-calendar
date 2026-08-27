-- Cho phép "dán" một ghi chú lên một ngày cụ thể trên lịch (kéo-thả từ
-- sidebar vào ô ngày) — ghi chú hiện thành một chip nhỏ ngay trên ngày đó,
-- giống một sự kiện cả ngày, nhưng KHÔNG phải là event thật (vẫn chỉ là một
-- ghi chú, có thể gỡ khỏi lịch bất kỳ lúc nào mà không mất nội dung).
--
-- Chỉ NGÀY, không giờ — ghi chú không có khái niệm thời điểm trong ngày.
-- NULL nghĩa là ghi chú chưa được dán lên lịch (trạng thái mặc định, giống
-- mọi ghi chú hiện có).
--
-- An toàn khi chạy lại nhiều lần.

alter table public.notes
  add column if not exists pinned_date date;
