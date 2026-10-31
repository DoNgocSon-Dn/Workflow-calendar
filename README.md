# Workflow Calendar

Windows 1.2.0 hoàn thiện giao diện ngày lễ Việt Nam theo cả âm/dương lịch,
49 dịp dựng sẵn và mục xem thử. Xem [cách dùng và phạm vi kiểm thử](NGAY-LE-VIET-NAM.md).

Lịch, công việc và không gian nhóm, hỗ trợ tiếng Việt/English, lịch âm và ngày lễ Việt Nam.

Bản 1.1.0 thêm kết bạn, chat riêng và mở nhanh bằng bản lưu trên máy, đồng bộ ở nền. Xem [báo cáo nâng cấp và kết quả kiểm thử](BAO-CAO-NANG-CAP-1.1.0.md).

Xem [bảng tình trạng từng chức năng](BAO-CAO-TINH-TRANG-CHUC-NANG.md) để phân biệt phần đã kiểm thử và phần còn cần nghiệm thu thực tế.

## Android (1.2.1 đang nghiệm thu)

Giao diện được đóng gói trong APK, dùng chung tài khoản và dữ liệu cloud. Có lịch hẹn thông báo native, nút bật quyền, báo thử và mở quyền báo đúng giờ.

- [Build, ký APK và giới hạn thông báo](frontend/android/README.md)
- Chưa có push cho chat khi app bị tắt hẳn; xem tình trạng kiểm thử thiết bị trong báo cáo.

## Windows

Bản desktop có cửa sổ riêng, khay hệ thống và popup nhắc lịch luôn nổi trên màn hình. Đăng nhập bằng email/mật khẩu; có đăng ký và khôi phục mật khẩu.

- [Hướng dẫn cài, dùng và build](desktop/README.md)
- [Kết quả kiểm thử và phần còn phụ thuộc dịch vụ](KIEM-THU-VA-BAN-GIAO.md)

## Chạy mã nguồn

Yêu cầu Node.js 24 và npm. Trong hai terminal riêng:

```powershell
cd frontend
npm ci
npm start
```

```powershell
cd backend
npm ci
# Tạo .env theo .env.example và điền cấu hình thật.
npm run start:dev
```

Frontend ở localhost:4200, backend ở localhost:3000.

## Kiểm thử

```powershell
npm --prefix frontend test -- --watch=false
npm --prefix frontend run build
npm --prefix frontend run i18n:check
npm --prefix backend test -- --runInBand
npm --prefix backend run build
npm --prefix desktop test
```

GitHub Actions kiểm tra ba phần và tạo artifact Windows.

## Dịch vụ

Supabase lưu tài khoản/dữ liệu; backend NestJS xử lý API, quyền, nhắc việc và AI. Bật Email provider trong Supabase. Khi dùng project mới, chạy các migration phù hợp trong `supabase/migrations/`.

Frontend dùng cấu hình công khai; bản Windows cho đổi kết nối trong menu **Workflow → Cấu hình kết nối**. Khóa service-role chỉ đặt ở backend; thiếu khóa thì cron nhắc việc, deadline và nối dài chuỗi lặp không chạy. SMTP, AI và push cần cấu hình tương ứng trong `backend/.env.example`.

**Trạng thái database 31/10/2026:** Supabase đã hoạt động trở lại. Migration 48/49 cho liên hệ/chat riêng và siết quyền nhóm đã áp dụng sau kiểm thử rollback; không còn dữ liệu thử. Các kết quả và giới hạn nghiệm thu được ghi rõ trong báo cáo 1.1.0.
