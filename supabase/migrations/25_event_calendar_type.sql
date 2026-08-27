-- Loại lịch của một sự kiện: 'solar' (Dương lịch) hoặc 'lunar' (Âm lịch).
--
-- Ngày lễ hệ thống KHÔNG nằm ở bảng này (chúng được tính ở client, xem
-- frontend/src/app/data/holidays.data.ts) — cột này chỉ dành cho sự kiện do
-- người dùng tạo, để "Lịch Dương" / "Lịch Âm" trong chế độ xem Lịch biểu lọc
-- được ở tầng dữ liệu chứ không chỉ ở giao diện.
--
-- Mọi hàng cũ mặc định 'solar' (đúng: chúng đều được tạo với ngày Dương lịch).
-- App vẫn chạy khi migration này CHƯA được apply — backend có nhánh dự phòng
-- bỏ cột này khi insert lỗi (xem events.service.ts).
--
-- An toàn khi chạy lại nhiều lần.

alter table public.events
  add column if not exists calendar_type text not null default 'solar';

alter table public.events
  drop constraint if exists events_calendar_type_check;

alter table public.events
  add constraint events_calendar_type_check
  check (calendar_type in ('solar', 'lunar'));
