-- Nhắc lịch (reminders) trước đây CHỈ là một tin realtime bắn qua socket lúc
-- cron xử lý — nếu đúng lúc đó tab đang đóng / máy đang ngủ / mạng rớt thì
-- người dùng không bao giờ thấy lại nhắc đó nữa: is_sent vẫn được đánh true
-- (cron không xử lý lặp lại), nhưng không có nơi nào lưu "đã bắn mà chưa ai
-- thấy" để bù sau.
--
-- Thêm seen_at: NULL nghĩa là đã bắn (is_sent = true) nhưng CHƯA có client
-- nào thực sự nhận được — API GET /reminders/missed sẽ trả về đúng các hàng
-- này rồi tự đánh dấu seen_at, để lần load sau không lặp lại.
--
-- An toàn khi chạy lại nhiều lần.

alter table public.reminders
  add column if not exists seen_at timestamptz;
