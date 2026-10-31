# Workflow Calendar Android 1.2.1

Ứng dụng Capacitor 8 chứa sẵn bản Angular production trong APK. Không cần chạy
máy chủ phát triển trên máy tính. API cloud vẫn cần mạng cho đồng bộ và thao tác ghi.

## Build

- Node 24, JDK 21, Android SDK 36 / build-tools 36.0.0; Android tối thiểu 7 (API 24).
- Từ `frontend`: `npm ci`, `npm run android:sync`.
- Từ `frontend/android`: `./gradlew assembleRelease` (Windows: `gradlew.bat`).
- Không cấu hình key: tạo APK release chưa ký. CI tải APK này dưới artifact
  `Workflow-Calendar-Android-unsigned`; phải ký trước khi cài.
- Ký release bằng các biến môi trường `WF_ANDROID_KEYSTORE`,
  `WF_ANDROID_STORE_PASS`, tùy chọn `WF_ANDROID_KEY_ALIAS` (mặc định `workflow`)
  và `WF_ANDROID_KEY_PASS` (mặc định bằng mật khẩu kho).
- Giữ nguyên key để các bản sau cập nhật được mà không mất dữ liệu app.
  Không đưa key/mật khẩu vào Git. `local.properties` và output build được bỏ qua.

## Nhắc lịch

Trong Lịch, bật quyền thông báo. Trong Cài đặt > Thông báo có nút thử sau 10 giây,
đồng bộ và mở quyền báo đúng giờ. Không tự bật quyền đặc biệt của Android.
Thông báo dùng kênh importance HIGH, âm thanh và rung; Android và cài đặt người dùng
quyết định có hiện nổi trên màn hình hay không. Không yêu cầu quyền vẽ đè/toàn màn hình.

Lưu tối đa 128 lời nhắc gần nhất trong 30 ngày từ dữ liệu của tài khoản đăng nhập
(Supabase RLS). Hẹn lại sau khi lưu lịch/nhắc việc, mở lại app, có mạng trở lại và
định kỳ khi app hoạt động. Query lỗi giữ nguyên các lời nhắc đã hẹn. Đăng xuất hoặc
đổi tài khoản xóa thông báo và lịch hẹn native. Lịch sửa trên máy khác cần mở app
điện thoại để cập nhật; chưa có dịch vụ đồng bộ liên tục khi app tắt hẳn.

Lời nhắc đã hẹn có thể chạy khi app ở nền. Force stop trong cài đặt Android,
quyền bị thu hồi, Không làm phiền hoặc giới hạn pin của hãng có thể ngăn/trì hoãn báo.
Chat realtime dùng khi app hoạt động; chưa tích hợp FCM cho chat khi app bị tắt.
Đăng nhập email/mật khẩu; link xác nhận/khôi phục mở trên web rồi quay lại app.

Trạng thái kiểm thử thiết bị được ghi trong báo cáo bàn giao; build thành công
không đồng nghĩa mọi chức năng đã được nghiệm thu trên điện thoại thật.

A52 đã cài và thử 1.2.0: đăng nhập, bản lưu và thông báo nổi khi ở nền hoạt động.
1.2.1 sửa Back đóng Cài đặt, nút nổi che hộp thoại và splash theo logo; test/build đạt,
chưa cài lại trên A52. Xem báo cáo cập nhật 01/11 trong thư mục gốc.
