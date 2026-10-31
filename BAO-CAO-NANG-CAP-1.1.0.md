# Báo cáo nâng cấp Workflow Calendar 1.1.0 — 31/10/2026

## Kết quả chính

Ứng dụng Windows dùng màu xanh dương theo logo, có popup riêng nổi trên màn hình, đăng nhập email/mật khẩu, kết bạn và chat riêng bằng văn bản. Lịch, công việc, ghi chú và danh sách nhóm có bản lưu theo tài khoản để mở nhanh, đồng bộ ở nền.

Đã cài bản 1.1.0 lên máy và xác nhận app dùng phiên đăng nhập đã lưu để mở thẳng vào lịch. Kiểm tra cửa sổ thật còn phát hiện màu điều khiển bị theme Halloween đổi sang cam; đã giữ màu nút theo màu thương hiệu, chỉ giữ sắc trang trí ngày lễ.

Hai migration `48` và `49` đã được kiểm thử trong giao dịch rollback rồi áp dụng lên project Supabase hiện tại. Kiểm tra lại xác nhận: bảng tin nhắn riêng tồn tại; người chưa đăng nhập không được gọi RPC chuyển trưởng nhóm; không còn policy `ALL` quá rộng trên ba bảng nhóm chính; không còn tài khoản thử.

Trạng thái phát hành được cập nhật ở cuối báo cáo. Bộ cài là bản Windows; chưa có bộ cài Android/iOS.

## Những phần vừa thêm

### Kết bạn và chat riêng

- Thêm mục **Liên hệ** từ thanh công cụ của Lịch và Việc cần làm, kèm số tin/lời mời chưa đọc.
- Tìm người bằng đúng email; gửi, nhận, đồng ý, từ chối, thu hồi lời mời; hủy kết bạn; chặn/bỏ chặn.
- Chỉ bạn bè được gửi tin. Chặn ngăn cả hai chiều; bỏ chặn không tự khôi phục kết bạn. Lịch sử vẫn giữ sau hủy kết bạn/chặn.
- Chat riêng 1:1 bằng văn bản; Enter gửi, Shift+Enter xuống dòng; tối đa 4.000 ký tự; tải từng trang 50 tin; trạng thái đã gửi/đã xem.
- Tin thời gian thực chỉ gửi tới phòng socket riêng của hai tài khoản. Request không được tự chỉ định người gửi.
- Gửi lại sau lỗi mạng dùng cùng khóa để tránh nhân đôi. Giữ bản nháp khi gửi lỗi, không xóa phần đang gõ mới hơn.
- Chỉ xác nhận đã đọc khi cuộc trò chuyện đang được xem, cửa sổ có focus và người xem đang ở cuối luồng.
- Thông báo tin riêng đi vào trung tâm thông báo và popup Windows riêng. Bấm popup mở đúng cuộc trò chuyện; sau khi socket nối lại, kiểm tra tin cuối chưa đọc để bù thông báo.
- Hỗ trợ màn hình nhỏ, giao diện sáng/tối theo hệ thống màu của ứng dụng và bản dịch vi/en.

Đây là kết bạn và chat chữ. Chưa có cuộc gọi thoại/video, tin thoại, gửi file trong chat riêng, mã hóa đầu cuối hoặc tìm bạn bằng số điện thoại.

### Mở app nhanh

- Sau một lần tải thành công, lưu bản đọc của lịch/sự kiện, việc cần làm, danh sách công việc, ghi chú và thông tin nhóm trên thiết bị.
- Mở lại sẽ dựng dữ liệu đã lưu trước khi API trả lời. Công việc, ghi chú, nhóm và lịch bắt đầu tải song song.
- Hiển thị trạng thái đang xem bản lưu/đang đồng bộ, thời điểm đồng bộ gần nhất và nút thử kết nối lại khi thất bại.
- Bản lưu tách theo tài khoản và project; kiểm tra hình dạng/ngày tháng; bỏ bản lỗi hoặc quá 30 ngày; lỗi hạn mức lưu trữ không làm app hỏng.
- Chỉ đưa kết quả server đã xác nhận vào bản lưu. Thao tác chưa lưu thành công không trở thành dữ liệu đã xác nhận trên máy.
- Các phản hồi tải lịch/việc/ghi chú cũ bị bỏ khi đổi tài khoản, tránh ghi đè dữ liệu người vừa đăng nhập.

Lần đăng nhập đầu, tải dữ liệu đầu tiên, làm mới phiên đã hết hạn và thao tác ghi lên cloud vẫn cần kết nối. Bản lưu giúp xem ngay, không thay thế cơ sở dữ liệu cloud hay hàng đợi chỉnh sửa offline. Mất mạng có thể xem bản lưu nếu phiên đăng nhập còn dùng được; chưa bảo đảm đăng nhập offline khi phiên đã hết hạn.

### Sửa quyền nhóm

- Giữ đúng vai trò Khách; giá trị role không nhận diện chỉ nhận quyền xem, không bị nâng thành Thành viên.
- Ngăn tự tham gia nhóm khác bằng cách chèn membership, tự nâng quyền, xóa người ngang/cao quyền và chuyển membership sang người/nhóm khác.
- Ngăn giả người gửi hoặc sửa nội dung tin của người khác trực tiếp qua REST. Sửa/xóa mềm đi qua RPC kiểm tra quyền; ghim chỉ dành cho quản lý.
- Thành viên được tạo việc, nhưng chỉ đổi trạng thái của việc giao cho mình; Khách không tạo/sửa việc. Người phụ trách phải là thành viên có quyền làm việc.
- Siết quyền lời mời nhóm, mốc đã đọc và bình chọn. Bình chọn ẩn danh không lộ ID người khác qua SELECT trực tiếp.
- Thu hồi quyền EXECUTE mặc định từ PUBLIC/anon đối với RPC nhóm; chỉ thu hồi từ anon trước đây vẫn chưa đủ.
- Sửa xóa sự kiện: nếu API từ chối, giữ dữ liệu và trả lỗi cho giao diện, không giả vờ đã xóa thành công.

## Kết quả kiểm thử

| Phần | Kết quả | Cách kiểm tra |
|---|---|---|
| Frontend | 37 file, 234 kiểm thử đạt | Vitest/Angular, gồm auth, lịch lặp, tìm kiếm, dữ liệu tài khoản, chat riêng và mở nhanh |
| Backend | 19 bộ, 131 kiểm thử đạt | Jest/NestJS, gồm validation, API chat, người nhận realtime, lỗi phân quyền, reminder và recurrence |
| Desktop | 8 kiểm thử đạt | Node test: hàng đợi popup, snooze/khởi động lại, giới hạn payload, cấu hình và local server |
| SQL chat riêng | 36 assertion đạt | 3 user thử không có mật khẩu/token; auth.uid + role authenticated; rollback |
| SQL nhóm | 34 assertion đạt | Owner/member/guest/admin/outsider; role anon; kiểm tra bảng/RPC; rollback |
| Build | Frontend, backend và bộ cài Windows | Biên dịch production và electron-builder |
| Bản dịch | Không thiếu khóa vi/en | `npm --prefix frontend run i18n:check` |
| Giao diện chat | Gửi bằng Enter, đọc tin, desktop và màn hình 390 px | Thành phần thật với API/dữ liệu mẫu cô lập, không gửi tới người thật |

Tổng kiểm thử ứng dụng: **373**; kiểm thử SQL được thống kê riêng. Test giả lập lỗi SMTP/mạng có log lỗi mong đợi; kết quả pass/fail nằm ở tổng kết của từng bộ.

## Rà soát chức năng và giới hạn xác minh

| Chức năng | Đã kiểm tra | Còn cần nghiệm thu thực tế |
|---|---|---|
| Email/mật khẩu, đăng ký, quên mật khẩu | Luồng UI/API, giữ đường dẫn sau đăng nhập; người dùng trước đó đã xác nhận vào được lịch trên web | Email thật, đổi mật khẩu và phiên đăng nhập Windows sau cập nhật cần chính chủ thao tác; không tạo tài khoản quản trị dùng chung |
| Lịch và sự kiện | Lưu thật, lỗi ghi, tìm không dấu, nhảy tháng, timezone/lunar helpers, cache và tách tài khoản | Các lịch chia sẻ đang có cần tiếp tục theo dõi bằng tài khoản thật |
| Lặp lại và thùng rác | Anchor ngày gốc, EXDATE, xóa chuỗi, cron phân trang, không hồi sinh chuỗi đã xóa | Cron cloud cần service-role và tiến trình backend đang chạy |
| Công việc, ghi chú | CRUD và kết quả xác nhận vào cache; tải song song, không lấy phản hồi của tài khoản cũ | Chưa có hàng đợi chỉnh sửa khi offline |
| Nhóm | Quyền bảng/RPC, tin nhắn, task, ghim, xóa mềm, bình chọn ẩn danh, chuyển trưởng nhóm | Chưa chạy đầy đủ mọi luồng lời mời/link/mã tham gia bằng hai phiên trình duyệt đăng nhập thật |
| Kết bạn/chat riêng | SQL/RLS thật, backend unit, store/UI, phân trang, chống trùng, chặn và đã đọc | Chưa nghiệm thu hai thiết bị/tài khoản đăng nhập thật và tải lớn |
| Popup/nhắc lịch | Queue bền vững, snooze, mở đích, ACK; executable/popup đã kiểm tra ở bản trước | Nhắc lịch cloud cần mạng và app đang chạy/ở khay; máy đã tắt hoặc app thoát hẳn không hiện popup |
| Import/AI | Parser, hủy import, lỗi dịch vụ và các test hiện có | Chưa gửi bộ tài liệu thật hoặc gọi Gemini/SMTP thật trong đợt này |
| Email/Web Push | Xử lý gửi lỗi không đánh dấu thành công, cấu hình và các test hiện có | Cần SMTP/VAPID và kiểm tra trình duyệt/thiết bị thật; email mặc định Supabase từng chạm giới hạn |
| Windows | Installer/portable, khay, một phiên app, cấu hình công khai, popup riêng | Chưa có chứng thư ký số và auto-update; không mua dịch vụ/chứng thư |

## Cách dùng

1. Mở **Workflow Calendar** từ desktop. Giữ đăng nhập để các lần sau không phải nhập lại khi phiên còn hợp lệ.
2. Đợi đồng bộ thành công một lần. Các lần mở tiếp theo sẽ dùng bản lưu và đồng bộ nền.
3. Chọn biểu tượng chat → **Liên hệ**, nhập đúng email của người đã có tài khoản.
4. Người kia vào **Lời mời** và đồng ý, sau đó nhắn tin trong **Tin nhắn**.
5. Để nhận popup, giữ app ở khay hệ thống. Bấm X cửa sổ sẽ đưa app về khay; chọn Thoát trong menu khay mới tắt hẳn.

## Phát hành

- Source: nhánh `codex/calendar-reliability-search`, PR #1.
- Database: migration 48/49 đã áp dụng và kiểm tra lại.
- Bộ cài: `desktop/release/Workflow-Calendar-Setup-1.1.0-x64.exe`; bản portable cùng thư mục.
- Mã nguồn đã được kiểm thử cục bộ. Trạng thái merge/deploy và kiểm tra endpoint production sẽ được ghi sau khi phát hành.
