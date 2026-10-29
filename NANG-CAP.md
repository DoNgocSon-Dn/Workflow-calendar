# Bản nâng cấp Workflow Calendar

## Thay đổi

- Tìm kiếm tiếng Việt không dấu trong tên, địa điểm và mô tả; hỗ trợ chữ Đ/đ, Unicode tổ hợp và khoảng trắng dư. Ví dụ: `hop nhom` tìm được `Họp nhóm`.
- Không tự gửi lại POST/PUT/PATCH/DELETE khi mất kết nối hoặc hết thời gian chờ. Mất phản hồi không chứng minh thao tác chưa được lưu; thay đổi này giảm nguy cơ tạo trùng dữ liệu.
- Mỗi lần thử lại yêu cầu đọc chạy lại các interceptor phía sau, để lấy token hiện tại.
- Lịch lặp tháng giữ ngày gốc: 31/1 → 28/2 → 31/3 → 30/4. Lặp năm từ 29/2 chuyển về 28/2 ở năm thường và trở lại 29/2 ở năm nhuận.
- Cập nhật hai kiểm thử cũ: vỏ ứng dụng và giả lập CalendarStore cho hủy nhập lịch.

## Kiểm tra

- Backend: build thành công; 13 bộ / 87 kiểm thử đạt.
- Frontend: build thành công; 25 bộ / 167 kiểm thử đạt.
- Build frontend còn ba cảnh báo dung lượng CSS ở landing page, nhóm và floating hub.

## Phạm vi

Đã chạy frontend và backend cục bộ, kiểm tra trang đăng nhập/trang giới thiệu trên trình duyệt, backend GET / trả 200 và GET /events chưa đăng nhập trả 401. Chưa triển khai production; chưa xác minh đăng nhập, email, AI, push hoặc thao tác Supabase bằng tài khoản thật. Phiên chạy backend dùng cấu hình Supabase công khai từ frontend; chưa có service-role key để kiểm tra các cron nhắc việc. Không tự sửa dữ liệu lịch cũ trong cơ sở dữ liệu; quy tắc ngày mới áp dụng khi tạo hoặc mở rộng chuỗi lặp.

Nếu thao tác ghi báo hết thời gian chờ, hãy tải lại để kiểm tra dữ liệu đã lưu trước khi thao tác lại. Để tự thử lại thao tác ghi an toàn hoàn toàn, cần bổ sung khóa idempotency ở API và cơ sở dữ liệu.

## Chạy trên máy

Dùng hai terminal riêng:

1. `cd backend`, cấu hình `.env` theo `.env.example`, chạy `npm ci` rồi `npm run start:dev`.
2. `cd frontend`, chạy `npm ci` rồi `npm start`.
3. Mở http://localhost:4200.

Việc cài autostart được nhắc trong tài liệu cũ không được xác minh hoặc thực hiện trên máy này.
