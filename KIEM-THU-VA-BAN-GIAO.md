# Bàn giao nâng cấp — 30/10/2026

Trạng thái mới nhất: đã truy cập dashboard, xác định project bị tạm dừng và yêu cầu Resume. DNS đã hoạt động lại, Auth health HTTP 200, Email provider bật và cho phép đăng ký. Dashboard còn báo khôi phục dữ liệu; chưa xác minh đăng nhập bằng tài khoản thật. Bản 1.0.1 xanh dương đã cài thành công.

## Đã thực hiện

- Bản Windows: installer/portable, shortcut qua installer, single instance, khay hệ thống và tùy chọn mở cùng Windows.
- Popup riêng luôn nổi: âm báo, hàng đợi, chống trùng, mở chi tiết, hoãn 5 phút và lưu lại khi khởi động lại.
- Thay Google bằng email/mật khẩu, thêm đăng ký/khôi phục mật khẩu. Rút gọn màn hình đăng nhập, hỗ trợ sáng/tối và vi/en.
- Thêm cấu hình và kiểm tra kết nối desktop; chặn secret/service-role key trong client.
- Không đánh dấu email gửi lỗi là đã gửi; chặn cron chạy chồng trong một tiến trình; cảnh báo rõ nếu thiếu cấu hình.
- Cron nối dài chuỗi lặp lúc 4 giờ sáng Việt Nam.
- Sửa nhảy tháng cuối tháng, anchor trang giới thiệu; giữ các sửa tìm không dấu, ngày gốc lịch lặp và retry an toàn trước đó.
- GitHub Actions kiểm tra frontend/backend/desktop và tạo artifact Windows.
- Chưa thay dữ liệu thật hoặc chạy migration lên cloud.

## Kiểm tra

- Frontend: 33 file, 203 kiểm thử đạt; build production thành công.
- Backend: 16 bộ, 104 kiểm thử đạt; build thành công.
- Desktop: 8 kiểm thử đạt cho queue, snooze/khởi động lại, payload/cấu hình và server.
- i18n: không thiếu khóa hoặc bản dịch vi/en.
- Đã mở executable đóng gói, kiểm tra popup thật và các nút xử lý.
- Vẫn có cảnh báo dung lượng CSS ở landing, group workspace và floating hub.

## Phần chưa xác minh trọn luồng

Hostname Supabase `wdiuuhsfflragxuurwpk.supabase.co` không phân giải DNS trên máy kiểm tra. Dashboard yêu cầu đăng nhập quản trị; tác vụ chưa có phiên quản trị. Vì vậy chưa xác minh tài khoản thật, email đăng ký/khôi phục, CRUD dữ liệu thật, lời mời nhóm, AI, email hoặc nhắc lịch từ cloud.

Backend local chưa có service-role key; cron được bỏ qua và ghi cảnh báo. Khóa bí mật không được đưa vào installer.

Để phục vụ người dùng thật: khôi phục/thay Supabase project, áp migration phù hợp, cấu hình backend/SMTP/AI/push, kiểm tra RLS và thử luồng bằng tài khoản thật. Chưa thể coi bản này đã nghiệm thu production trước khi hoàn tất các bước đó.

## Vị trí

- Mã nguồn: nhánh `codex/calendar-reliability-search`.
- Bộ cài: `desktop/release/`.
- Dữ liệu desktop: thư mục userData riêng trong profile Windows.

Máy được giữ mở nếu còn bước quản trị tài khoản cần người dùng thao tác. Không tự vượt qua đăng nhập hoặc mua dịch vụ/chứng thư ký số.

## Bản 1.0.1

- Khôi phục màu xanh dương theo logo cho đăng nhập, popup và cài đặt desktop.
- Sửa luồng bấm popup từ trang Công việc/Import; giữ thông báo đến khi đích thực sự mở được.
- Sửa mất nhắc lịch do GET đánh dấu đã xem trước khi client nhận, thêm xác nhận riêng; snooze xóa dấu đã xem, bỏ nhắc của sự kiện trong thùng rác.
- Bảo toàn mốc đầu chuỗi lặp khi xóa buổi đầu, đọc đủ các trang Supabase.
- Lưu thông báo, ngày sinh và tùy chọn sinh nhật theo tài khoản; xử lý lỗi lưu hồ sơ.
- Giữ link đích khi đăng ký/khôi phục và giới hạn token theo đúng origin API.
- Đã đăng nhập dashboard và xác định project bị paused, không bị mất dữ liệu. Đã yêu cầu Resume project; theo dõi đến khi dịch vụ hoạt động.
