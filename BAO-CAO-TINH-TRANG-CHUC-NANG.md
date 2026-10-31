# Tình trạng chức năng - cập nhật 01/11/2026

Đánh giá theo bằng chứng đã có; không coi build hoặc unit test đạt là đã nghiệm
thu toàn bộ trên thiết bị thật. Báo cáo 1.1.0 vẫn giữ thông tin chi tiết đợt Windows.

| Chức năng | Tình trạng | Đã xác minh / còn thiếu |
|---|---|---|
| Đăng nhập, giữ phiên | Đã chạy thực tế | Windows mở bằng phiên đã lưu; A52 đăng nhập được tài khoản có sẵn và vào lịch |
| Đăng ký, quên mật khẩu | Cần thử thêm | UI/API và test luồng có; chưa nghiệm thu lại email thật xuyên suốt trên Android |
| Lịch, sự kiện | Đạt kiểm thử | Lưu dữ liệu, trả lỗi khi API từ chối, tách tài khoản; chưa bao phủ mọi thao tác bằng tay |
| Lịch lặp, tìm kiếm | Đạt kiểm thử | Anchor, cuối tháng, EXDATE, xóa chuỗi, tìm không dấu và hàm ngày giờ |
| Công việc, ghi chú | Đạt kiểm thử | Cache kết quả server, tách tài khoản; chưa có hàng đợi chỉnh sửa offline |
| Thùng rác | Đạt một phần | Xóa chuỗi, không hồi sinh dữ liệu; cần thử thêm mọi luồng khôi phục/xóa hẳn trên điện thoại |
| Mở app nhanh | Đã chạy trên Windows và A52 | Dựng bản lưu trước, đồng bộ nền; lần đầu và ghi lên cloud vẫn cần mạng |
| Nhóm, phân quyền | Quyền đạt; luồng cần thử thêm | 34 assertion SQL; chưa đủ hai tài khoản thật cho mọi luồng |
| Kết bạn, chặn, chat chữ | Đạt test; cần thử thiết bị thật | 36 assertion SQL, API/store/UI; chưa nghiệm thu đầy đủ hai thiết bị |
| Popup Windows | Đã có và kiểm tra | Nổi trên màn hình, âm, snooze, mở đích; cần chạy app/khay |
| Màu thương hiệu/ngày lễ | Giữ đúng chức năng | Xanh dương mặc định; tự đổi màu ngày lễ vẫn giữ |
| Import, AI | Chưa chốt | Parser và xử lý lỗi có test; chưa đủ tài liệu/dịch vụ AI thật |
| Email, Web Push | Chưa chốt | Cần xác nhận gửi/nhận thực tế và cấu hình dịch vụ |
| Android | Có bản thử đã cài | A52 cài 1.2.0, đăng nhập và báo thử ở nền được. APK 1.2.1 đã ký, chưa cài lại do điện thoại ngắt USB |

## Bằng chứng đợt Android

- Frontend: **247 kiểm thử / 41 file đạt**, không có unhandled rejection trong lượt cuối.
- Thêm 13 ca: lập lịch native, snooze, phạm vi ngày, giới hạn/dedupe, lỗi query giữ
  alarm cũ, logout không nhận phản hồi cũ, hủy alarm đã xóa, không tự xin quyền,
  cách ly thông báo của tài khoản khác, URL email không trỏ về localhost WebView,
  Back đóng hộp thoại trên cùng và giữ cách xử lý hủy của từng form.
- `i18n:check` không thiếu khóa vi/en; hướng dẫn Android mới hiện bằng tiếng Việt.
- Angular cập nhật đồng bộ **21.2.25**. `npm audit --omit=dev`: **0 cảnh báo** cho
  dependency frontend chạy thực tế tại lần kiểm tra này. Tool phát triển: 23 cảnh
  báo (18 moderate, 5 high), chưa nâng major cưỡng bức.
- Backend 1.1.0: 131 test / 19 bộ; desktop: 8 test; SQL: 70 assertion (34 nhóm +36 chat).
- CI cuối, commit `0844f78`: **frontend, backend, desktop, Android đều success**.
  Job Android đầu từng lỗi package SDK `tools`; đã sửa sang `platform-tools`.

## Kiểm tra A52 ngày 31/10

- Cài APK release ký v2/v3, version 1.2.0 (10200), Android 14 / API 34.
- Đăng nhập tài khoản có sẵn thành công; không đổi mật khẩu hay sao chép phiên Windows.
- Bật quyền thông báo và báo đúng giờ qua giao diện Android.
- Thông báo thử sau 10 giây **đã hiện nổi khi app ở nền**; có ảnh bằng chứng.
  Chưa xác nhận âm thanh nghe được vì điện thoại đang có trạng thái im lặng.
- Khởi động lại app vẫn giữ phiên, hiển thị bản lưu và đồng bộ nền.
- Sự kiện thử tạo qua API đã xuất hiện trên A52; Android AlarmManager ghi nhận
  alarm cho đúng mốc nhắc. Chưa nghiệm thu trọn lần nhắc sự kiện/chạm mở đích.
- Lịch thử riêng chỉ có một thành viên và một sự kiện đã được dọn, kiểm tra lại
  xác nhận không còn lịch thử trên server (01/11).
- Test phát hiện nút nổi che Cài đặt và Back chưa đóng Cài đặt. Mã 1.2.1 đã sửa
  hai lỗi này, thêm test và build CI đạt; **chưa thử lại trên điện thoại**.

## Bản bàn giao Android

- Đã cài trên A52: **1.2.0**.
- APK mới **1.2.1** đã ký cùng key, xác minh v2/v3; có thể cập nhật giữ dữ liệu.
- SHA-256: `CBEA0312A466331CF7D18EEC153DAB7221D5A04D0BB8364FC966BF27E7EF6202`.
- Source: nhánh `codex/android-app`, chưa merge vào `master`.
- Chưa cài 1.2.1 vì kiểm tra ngày 01/11 không còn thiết bị ADB kết nối.

## Android đã thêm trong mã nguồn

Giao diện Angular nằm trong APK, API cloud và cache theo tài khoản giữ nguyên.
Native notification hẹn tối đa 128 lời nhắc trong 30 ngày, refresh sau khi lưu,
mở lại app, reconnect và định kỳ khi đang hoạt động. Query lỗi không xóa alarm cũ.
Logout đổi tài khoản dọn alarm/thông báo native. Có nút bật quyền, báo thử sau 10
giây và mở quyền báo đúng giờ. Link ngoài mở trình duyệt; Back xử lý trong app.

Chưa có FCM cho chat khi app bị tắt hẳn. Chỉnh sửa từ máy khác cần mở điện thoại
để cập nhật alarm; chưa có đồng bộ lịch liên tục khi app tắt. Heads-up phụ thuộc
Android, kênh thông báo, Không làm phiền và giới hạn pin. Không xin quyền vẽ đè
hoặc toàn màn hình. Email xác nhận/reset mở trên website, sau đó quay lại app.
Chat riêng hiện có văn bản; chưa có gọi thoại/video, tin thoại, gửi file hoặc mã hóa đầu cuối.

## Còn phải nghiệm thu

1. Cài 1.2.1 và thử lại Back, nút nổi, các hộp thoại; thử nhắc khi khóa màn hình/ở nền lâu.
2. Nghiệm thu trọn event-reminder, đồng bộ PC/điện thoại và mở đúng event khi chạm thông báo.
3. Hai tài khoản thật: nhóm, lời mời/link/mã, vai trò, kết bạn/chặn/chat/read receipts.
4. Email thật, Gemini, Web Push, import tài liệu thật, tải lớn và mất mạng/mở lại.
