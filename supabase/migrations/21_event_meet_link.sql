-- Tách link Google Meet/hội nghị truyền hình ra khỏi ô "Vị trí" thành một
-- trường riêng, khớp với giao diện tạo sự kiện của Google Calendar (hai ô
-- tách biệt: "Vị trí" và "Thêm hội nghị truyền hình").
--
-- An toàn khi chạy lại nhiều lần.

alter table public.events
  add column if not exists meet_link text;
