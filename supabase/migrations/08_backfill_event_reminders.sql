-- Bổ sung lời nhắc cho các sự kiện đã tạo TRƯỚC khi form bật lời nhắc mặc định.
--
-- Bối cảnh: trước đây mục "Lời nhắc" trong form tạo sự kiện bị thu gọn và
-- không tick sẵn gì, nên gần như mọi sự kiện cũ đều không có lời nhắc nào —
-- lịch có mà không nhắc thì mất nửa công dụng.
--
-- Chạy 1 lần trong Supabase SQL Editor. AN TOÀN KHI CHẠY LẠI: câu lệnh có
-- NOT EXISTS nên lần chạy thứ hai sẽ không tạo bản trùng.

-- ============================================================
-- BA LỚP BẢO VỆ, đọc kỹ trước khi chạy:
--
-- 1. CHỈ sự kiện còn ở TƯƠNG LAI (start_at > now() + 20 phút).
--    Nếu backfill cả sự kiện đã qua, cron sẽ thấy hàng loạt reminder quá hạn
--    và bắn dồn dập ngay lần chạy kế tiếp — chuông kêu liên tục hàng chục lần.
--
-- 2. CHỈ sự kiện CHƯA có lời nhắc nào. Không đụng tới sự kiện mà người dùng
--    đã tự đặt lời nhắc, kể cả khi họ đặt mốc khác 15 phút.
--
-- 3. Mỗi THÀNH VIÊN của lịch nhận một lời nhắc riêng, vì bảng reminders gắn
--    theo user_id. Không tạo cho lịch nào không có thành viên.
-- ============================================================

insert into public.reminders (event_id, user_id, remind_at, remind_type, is_sent)
select
  e.id,
  cm.user_id,
  e.start_at - interval '15 minutes',
  'popup',
  false
from public.events e
join public.calendar_members cm on cm.calendar_id = e.calendar_id
where e.deleted_at is null
  -- Lớp 1: chỉ tương lai, và còn đủ xa để mốc nhắc chưa trôi qua.
  and e.start_at > now() + interval '20 minutes'
  -- Lớp 2: chưa có lời nhắc nào cho đúng cặp (sự kiện, người dùng).
  and not exists (
    select 1 from public.reminders r
    where r.event_id = e.id and r.user_id = cm.user_id
  );

-- Xem kết quả: số lời nhắc vừa tạo cho từng người.
-- select u.email, count(*) as reminders_added
-- from public.reminders r
-- join auth.users u on u.id = r.user_id
-- where r.created_at > now() - interval '5 minutes'
-- group by u.email;
