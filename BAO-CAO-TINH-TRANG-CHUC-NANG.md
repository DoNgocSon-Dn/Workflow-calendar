# Tình trạng chức năng — 02/11/2026

Đánh giá theo bằng chứng đã có. [Báo cáo Android 1.3.1 và realtime](ANDROID-1.3.1.md)
ghi chi tiết các thay đổi, tài khoản thử, kiểm tra và giới hạn của bản mới.

| Chức năng | Hiện trạng | Đã xác minh / còn thiếu |
|---|---|---|
| Đăng nhập, giữ phiên | Đã chạy thực tế | Windows và A52 giữ phiên; tài khoản QA mới đăng nhập được vào giao diện web |
| Đăng ký, quên mật khẩu | Cần thử thêm | Có UI/API/test; chưa nghiệm thu lại email thật xuyên suốt trên Android |
| Lịch, sự kiện | Đạt kiểm thử, đã xem trên A52 | Dữ liệu, trả lỗi, tách tài khoản, giờ tạo mới; chưa thao tác tay hết mọi CRUD |
| Âm/dương, ngày lễ | Có và giữ nguyên chức năng | Android xem cả âm/dương; xanh dương mặc định và giao diện ngày lễ vẫn hoạt động |
| Lịch lặp, tìm kiếm | Đạt kiểm thử | Anchor, cuối tháng, EXDATE, xóa chuỗi, tìm không dấu, hàm ngày giờ |
| Công việc, ghi chú | Đạt kiểm thử | Thẻ Android chuyển thành danh sách dọc; chưa có hàng đợi ghi offline |
| Thùng rác | Đạt một phần | Test xóa chuỗi/không hồi sinh dữ liệu; chưa thử hết khôi phục/xóa hẳn trên A52 |
| Mở app nhanh | Đã chạy Windows/A52 | Dựng bản lưu rồi đồng bộ nền; sửa cache web làm kẹt splash khi nâng APK |
| Nhóm, phân quyền | Có test quyền; cần nghiệm thu thêm | 34 assertion SQL ở đợt trước; chưa thử lại toàn bộ vai trò và thiết bị trong đợt này |
| Kết bạn email/mã | Đã kiểm tra hai tài khoản thật | Mã riêng, lời mời, đồng ý, chặn/mở chặn; migration 50 và 14 assertion RLS mới đạt |
| Chat riêng realtime | Đã kiểm tra hai chiều | Tin và read receipt qua Socket.IO, gửi lại không trùng, tải bù tin lỡ; giao diện tự hiện tin không Làm mới |
| Chat khi tắt hẳn app | Chưa hoàn thiện | Chưa có FCM; không bảo đảm nhận thông báo chat khi app bị tắt |
| Popup Windows | Đã kiểm tra đợt trước | Nổi, âm, snooze, mở đích; cần app/khay hoạt động |
| Nhắc lịch Android | Đã thử ở nền | A52 1.3.0 nhận báo thử và chạm về lịch; chưa nghiệm thu khóa màn hình/qua đêm và mọi sự kiện thật |
| Giao diện Android | Đã nâng cấp, cần cài bản cuối | Điều hướng ba mục, bàn phím/Back, form gọn, picker mới; A52 đang 1.3.0, bản cuối 1.3.1 chưa cài do USB unauthorized |
| Import, AI | Chưa chốt toàn bộ | Parser/xử lý lỗi có test; cần tài liệu và dịch vụ AI thật |
| Email, Web Push | Chưa chốt toàn bộ | Cần kiểm tra gửi/nhận và cấu hình dịch vụ; native không dùng service worker web |

## Kiểm tra đợt này

- Frontend: **297 kiểm thử / 50 file** đạt.
- Backend: **141 kiểm thử / 20 bộ** đạt, gồm 4 ca transport Socket.IO thật trên localhost.
- Service worker: **5/5** đạt; production build, Capacitor sync, NestJS build đạt.
- Mã kết bạn: **14 assertion SQL/RLS** mới đạt trên Supabase, fixture rollback.
- **12 kiểm tra live** qua backend hiện tại trên máy và Supabase thật, dùng hai JWT
  người dùng riêng; thêm kiểm tra giao diện nhận/gửi tin thực tế.
- Desktop 8 test và 70 assertion nhóm/chat của các đợt trước là bằng chứng lịch sử,
  không coi là đã chạy lại trên thiết bị trong đợt này.

Tài khoản QA mới là tài khoản thường, không có quyền quản trị. Giữ lại các tin có
nhãn QA giữa hai tài khoản thử để kiểm tra tiếp. Không gửi tin tới người dùng khác
hoặc thay đổi nhóm/lịch của họ. Chưa thể kết luận toàn bộ app đã ổn 100% chỉ từ test/build.

## Việc còn lại cần nghiệm thu

1. Cài APK cuối 1.3.1 sau khi điện thoại cấp quyền USB, kiểm tra picker, bàn phím và mọi thao tác Android.
2. Nhắc lịch thật khi khóa màn hình/ở nền lâu, đồng bộ PC/điện thoại và mở đúng sự kiện.
3. Mọi vai trò nhóm, lời mời/link/mã nhóm, chat nhóm trên hai thiết bị thật.
4. Email xác nhận/reset, AI, Web Push, import tài liệu thật, tải lớn và mất mạng.
5. Tích hợp FCM nếu cần nhận chat khi app đóng; chat file/thoại/video và mã hóa đầu cuối hiện chưa có.
