# Workflow Calendar cho Windows

## Cài và mở

- `Workflow-Calendar-Setup-1.0.1-x64.exe`: cài cho tài khoản Windows hiện tại, tạo shortcut Desktop và Start Menu.
- `Workflow-Calendar-Portable-1.0.1-x64.exe`: chạy trực tiếp.

Bản đóng gói không cần Node.js hoặc terminal. Máy vẫn cần Internet và Supabase/backend đang hoạt động để đăng nhập, đồng bộ và nhận nhắc lịch từ máy chủ. Bản này chưa có chứng thư ký số thương mại.

## Popup riêng

Đây là cửa sổ riêng luôn nổi phía trên cửa sổ thông thường, không chỉ là toast của Windows.

- Giữ lại đến khi chọn **Xem lịch**, **Nhắc lại 5 phút** hoặc **Đóng**.
- Âm báo theo lựa chọn âm thanh trong ứng dụng.
- Hiển thị lần lượt, có số đếm hàng đợi và chống trùng ID.
- Lưu popup đang chờ/đã hoãn; xử lý lại đến hạn khi app chạy lại hoặc máy tỉnh sau sleep.
- Đóng cửa sổ chính sẽ thu xuống khay hệ thống và tiếp tục nhắc.
- **Thoát hẳn** sẽ dừng chương trình. Popup riêng không thể xuất hiện khi app đã thoát, máy tắt hoặc màn hình bị khóa.
- **Mở cùng Windows** mặc định tắt; người dùng có thể bật trong bản cài.
- Chế độ toàn màn hình độc quyền của trò chơi và màn hình bảo mật Windows có thể chặn lớp nổi.

Thử tại **Thông báo → Gửi nhắc lịch thử ngay** hoặc **Nhắc thử sau 10 giây**. Thử popup không tạo sự kiện lịch thật.

## Tài khoản và kết nối

Email/mật khẩu thay cho Google. Tạo tài khoản mới hoặc khôi phục mật khẩu của tài khoản cũ nếu chưa có mật khẩu. Không tự xóa/chuyển dữ liệu tài khoản Google cũ.

Menu **Workflow → Cấu hình kết nối** nhận Supabase URL, publishable/anon key và URL HTTPS của backend cùng project. Không dùng secret/service-role key ở client. Bấm **Kiểm tra kết nối**, sau đó **Lưu và mở lại lịch**. Đổi kết nối sẽ dọn hàng đợi popup cũ.

Bật Email provider trong Supabase. Để email xác nhận/khôi phục quay về đúng trang, thêm vào Redirect URLs:

```text
http://127.0.0.1:42817/login
http://127.0.0.1:42817/reset-password
```

Email xác nhận/khôi phục phụ thuộc SMTP và hạn mức project. Đăng nhập mật khẩu trực tiếp không cần callback Google.

App chỉ bind server ở `127.0.0.1:42817`, không mở cổng LAN. Nếu cổng bị chiếm, app báo lỗi.

## Build

```powershell
npm --prefix frontend ci
npm --prefix desktop ci
npm --prefix desktop test
npm --prefix desktop run dist
```

Nếu npm chặn postinstall Electron, trong `desktop/` chạy `node node_modules/electron/install.js` để tải runtime từ package chính thức đã cài, sau đó `npm run dist`.

Kết quả ở `desktop/release/`. Không commit build, node_modules hoặc `.env`.

Giao diện chạy sandbox, không có Node integration. Bridge chỉ cung cấp các thao tác giới hạn. Popup nạp nội dung cục bộ và hiển thị nội dung thông báo bằng `textContent`.
