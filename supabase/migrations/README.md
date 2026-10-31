# Migration database

Khi dựng project mới, chạy `../schema.sql` trước, sau đó các migration theo tên: `0000`, `0002`…`0006`, `02`…`15a`, `15b`, `16`…`20a`, `20b`, `21`…`49`. Không có `0001`/`01`; đây là cách đánh số của dự án.

Không chạy lại toàn bộ migration cũ lên database đang dùng. Một số file cũ thay thế policy/role và có thể ghi đè chính sách mới dù dùng `IF EXISTS`. Kiểm tra schema, bản sao lưu và các migration đã áp dụng; chỉ áp phần còn thiếu theo thứ tự. Luôn chạy migration 49 sau các migration nhóm cũ.

## Bản 1.1.0

- `48_friends_and_direct_messages.sql`: lời mời kết bạn, chặn và chat 1:1; RLS và RPC dùng `auth.uid()`.
- `49_group_access_hardening.sql`: siết quyền membership/task/chat/invite, bảo vệ bình chọn ẩn danh và thu hồi EXECUTE khỏi PUBLIC/anon cho RPC nhóm.
- Hai file đã được kiểm thử rollback và áp dụng lên project hiện tại ngày 31/10/2026. Không xóa hoặc gán lại các bản ghi nhóm sẵn có.

`../tests/social-rls.integration.sql` và `../tests/group-access.integration.sql` tạo tài khoản không có mật khẩu/token và dữ liệu giả trong giao dịch, chạy assertion rồi `ROLLBACK`. Không đổi phần cuối thành `COMMIT`. Đây là kiểm thử SQL/RLS, không thay thế nghiệm thu bằng hai phiên đăng nhập thật.

Các tính năng trước 48 còn cần schema tới 47. Xem nội dung từng file và báo cáo nghiệm thu ở gốc repo; không suy ra một migration đã áp dụng chỉ từ việc file có trong Git.
