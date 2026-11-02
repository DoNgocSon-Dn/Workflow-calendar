# Android 1.3.1 và liên hệ realtime — 02/11/2026

## Đã hoàn thiện

| Phần | Thay đổi | Bằng chứng |
|---|---|---|
| Điều hướng Android | Ba mục Lịch, Công việc, Liên hệ; nút tạo có chữ; tránh che nút và thanh hệ thống | Đã chạy A52 với 1.3.0; test điều hướng trong bản mới |
| Lịch | Hiện cả âm/dương mặc định trên điện thoại, lọc nâng cao thu gọn, chuyển ngày/tháng và trạng thái trống rõ hơn | A52 1.3.0 và unit test |
| Tạo sự kiện | Không còn mặc định 1 giờ sáng khi tạo vào buổi tối; không sửa nhầm Date đang dùng chung | A52 1.3.0 và test ngày/giờ |
| Chọn ngày/giờ | Bảng chọn trong màn hình, nút đóng rõ, cuộn tới giờ đang chọn, xử lý màn hình ngang | Component thật trong trang kiểm tra cô lập: 390×844 và 844×390; chưa cài 1.3.1 lên A52 |
| Công việc | Danh sách dọc, thẻ đầy chiều rộng trên điện thoại | Build và CSS; chưa nghiệm thu lại toàn bộ CRUD trên A52 |
| Bàn phím/Back | Enter xuống dòng trong chat/AI Android; Back đóng bàn phím trước rồi đóng form; giữ nút lưu phía trên bàn phím | A52 1.3.0, unit test |
| Cập nhật APK | Bỏ service worker web trong native, dọn cache HTML cũ gây kẹt splash sau cập nhật | A52 1.3.0, 5 kiểm thử service worker |
| Kết bạn bằng mã | Mã riêng dạng `WF-XXXX-XXXX-XXXX`, sao chép để chia sẻ; vẫn hỗ trợ email | Migration 50 đã áp dụng; 14 assertion SQL/RLS và hai tài khoản thật |
| Giao diện Liên hệ | Thêm bạn mở khi cần; chung ô tìm tên/email không dấu cho tin nhắn/bạn bè/lời mời; báo lỗi ở vị trí nhìn thấy | Test component và trình duyệt với dữ liệu thật |
| Tin nhắn realtime | Gửi/nhận, báo đã đọc, chống trùng khi gửi lại; tải bù sau mất mạng/quay lại app, giữ bản nháp | Socket.IO transport test, store test, 12 kiểm tra live và giao diện thật nhận tin không cần Làm mới |
| Nhắc lịch native | Kênh Android có âm/rung, nút mở cài đặt thông báo; chạm thông báo về lịch | A52 1.3.0: báo thử khi ở nền, chạm mở lịch thành công |

## Tài khoản và kiểm thử thật

Đã tạo tài khoản QA riêng `workflow-qa-20261102@example.invalid`, đăng nhập được bằng
email/mật khẩu và ghép với tài khoản thử Workflow đã có. Đây là tài khoản thường,
không cấp quyền quản trị. Không gửi email mời tới người dùng khác. Mật khẩu QA
ngẫu nhiên được lưu cục bộ bằng Windows DPAPI, không đưa vào Git hoặc báo cáo.

12 kiểm tra live chạy qua backend hiện tại trên máy và **Supabase thật**, với JWT
riêng của từng tài khoản, không dùng service-role:

1. Hai phiên đăng nhập và hai phòng Socket.IO cá nhân sau xác thực.
2. Mã kết bạn khác nhau giữa hai tài khoản và giữ nguyên khi lấy lại.
3. Gửi mã viết thường, nhận lời mời realtime đúng tài khoản.
4. Chưa đồng ý thì gửi tin bị từ chối.
5. Đồng ý lời mời cập nhật cả hai bên.
6. Tin A → B đến qua socket và trùng ID bản ghi đã lưu.
7. Tin trả lời B → A đến qua socket.
8. Báo đã đọc về đúng người gửi.
9. Gửi lại cùng khóa không tạo tin trùng.
10. Mất kết nối rồi vào lại lấy được tin đã lỡ.
11. Chặn ngăn cả nhắn tin lẫn mời lại bằng mã.
12. Mở chặn, mời và đồng ý lại thì chat được.

Sau đó đăng nhập tài khoản mới vào giao diện thật, mở cuộc trò chuyện, gửi thêm tin
từ bên kia và xác nhận tin tự xuất hiện trong lịch sử lẫn danh sách mà không tải
lại trang. Tài khoản mới gửi trả lời bằng nút Gửi thành công. Giữ tài khoản QA,
quan hệ thử và các tin có nhãn `[QA]` để kiểm tra lại; không sửa dữ liệu nhóm hay
lịch của người khác. Script chạy lại: `backend/scripts/test-social-live.mjs`;
cần chủ động bật `WF_LIVE_SOCIAL_TEST=1` và cấp hai bộ thông tin đăng nhập QA.

## Kiểm tra tự động

- Frontend: **297 kiểm thử / 50 file** đạt.
- Backend: **141 kiểm thử / 20 bộ** đạt; gồm 4 ca truyền Socket.IO thực trên localhost.
- Service worker: **5/5** đạt.
- SQL mã kết bạn: **14/14 assertion** đạt trên Supabase; dữ liệu fixture rollback.
- Build Angular production, Capacitor sync và build NestJS đạt.
- i18n vi/en không thiếu khóa. Các cảnh báo ngân sách CSS hiện có không làm build thất bại.
- 70 assertion nhóm/chat của đợt trước là bằng chứng lịch sử, không ghi là đã chạy lại trong đợt này.

## Thiết bị và giới hạn còn lại

A52 hiện cài **1.3.0**, cập nhật cùng key giữ được phiên. Đã kiểm tra Back đóng menu,
bàn phím và form, giờ tạo mới, quyền thông báo, báo thử ở nền và chạm mở lịch.
Ảnh mới của bộ chọn và giao diện Liên hệ là kiểm tra trình duyệt/component, không
được coi là ảnh APK 1.3.1 trên điện thoại. Ngày 02/11 ADB vẫn báo `unauthorized`
dù đã khởi động lại kết nối; chưa cài hoặc nghiệm thu trực tiếp bản cuối 1.3.1.

- **Chưa có FCM:** chat realtime khi đang mở app; không hứa nhận chat push khi app bị tắt hẳn.
- Lời nhắc đã hẹn chạy native ở nền. Sửa lịch trên máy khác cần mở app điện thoại để hẹn lại.
- Heads-up, âm thanh, màn hình khóa và độ đúng giờ còn phụ thuộc cài đặt Android/Samsung, Không làm phiền và giới hạn pin. Lượt 1.3.0 không xác minh được âm nghe thấy hoặc banner nổi.
- Chưa nghiệm thu lại đầy đủ event-reminder khi khóa màn hình/qua đêm, mọi vai trò nhóm trên hai thiết bị và toàn bộ CRUD Android.
- Chat hiện là chữ; chưa có file, tin thoại, gọi thoại/video hoặc mã hóa đầu cuối.
- Cache cho mở/xem nhanh; chưa có hàng đợi chỉnh sửa offline.

APK release được CI build từ nhánh PR, ký cùng key cũ và kiểm tra chữ ký trước
khi bàn giao. Tệp cài và checksum được cung cấp cùng bản bàn giao; không gỡ app
hoặc xóa dữ liệu để cập nhật.
