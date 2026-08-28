# Hướng dẫn chạy app

## TL;DR — đã cài tự động

Autostart **đã được cài**: mỗi lần đăng nhập Windows, backend + frontend tự bật
(2 cửa sổ `CALENDAR ...` thu nhỏ ở taskbar). Sau khi bật máy, chờ ~1 phút rồi
mở `http://localhost:4200` là dùng được bình thường.

- File autostart: `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Calendar App.cmd`
- Log mỗi lần chạy: `calendar\logs\start-dev-*.log`
- **Gỡ autostart:** `powershell -ExecutionPolicy Bypass -File .\autostart-uninstall.ps1`
- **Cài lại / bật kèm mở trình duyệt:** `.\autostart-install.ps1 -OpenBrowser`

Nếu vẫn gặp lỗi *"Không thể xử lý lời mời"*: xem [mục 3](#3-vẫn-lỗi-bảng-tra-nhanh)
và [mục 4](#4-bắt-lỗi-thật-khi-cần-mình-sửa-tận-gốc).

---

## 0. Vì sao phải theo thứ tự

Nút **"Chấp nhận lời mời vào nhóm"** không gọi thẳng Supabase. Đường đi thật:

```
Trình duyệt (localhost:4200)
   │  PATCH /groups/invites/:id/respond
   ▼
Angular dev server  ──(proxy.conf.json)──►  Backend NestJS (localhost:3000)
                                                │  RPC respond_group_invite
                                                ▼
                                          Supabase cloud (wdiuuhsfflragxuurwpk)
```

Nếu **thiếu 1 mắt xích** (backend chưa chạy, backend chưa build xong, hoặc
Supabase cloud đang "ngủ") thì backend trả lỗi, và frontend hiện câu chung:

> **Không thể xử lý lời mời. Vui lòng thử lại.**

(Câu này xuất hiện với *mọi* lỗi trừ 404. Lỗi token hết hạn thì app tự refresh,
không ra câu này — nên thấy câu này = mắt xích phía sau đang hỏng, không phải
lỗi đăng nhập.)

Lịch, sự kiện, danh sách nhóm... vẫn có thể hiển thị nhờ dữ liệu cache trong
tab cũ, nên "app trông vẫn chạy" nhưng thao tác ghi thì fail. Đừng bị đánh lừa.

---

## 1. Chạy tay khi cần (autostart bị tắt, hoặc muốn thấy log)

```powershell
cd "d:\web-ca-nhan\app-lịch\web26a-357-project-master\web26a-357-project-master\calendar"
powershell -ExecutionPolicy Bypass -File .\start-dev.ps1
```

Script `start-dev.ps1` làm 6 bước, tự bỏ qua thứ nào đã chạy sẵn:

| Bước | Việc |
|---|---|
| 1 | Kiểm tra `backend/.env` có đủ khoá Supabase |
| 2 | Đợi có mạng (lúc mới bật máy card mạng có thể chưa lên) |
| 3 | Bật backend `npm run start:dev` nếu cổng 3000 chưa có ai |
| 4 | **Đợi cổng 3000 trả lời** — bước quan trọng nhất |
| 5 | Bật frontend `npm start` nếu cổng 4200 chưa có ai |
| 6 | Đợi frontend build xong |

Tham số: `-Auto` (không hỏi gì), `-OpenBrowser` (tự mở tab), `-Minimized`.

Nếu báo *"running scripts is disabled"*: dùng đúng dòng trên (có
`-ExecutionPolicy Bypass`) hoặc chạy 1 lần `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`.

---

## 2. Cách thủ công — 4 bước, và "đúng thì thấy gì"

### Bước 1 — Đánh thức Supabase cloud

Vào <https://supabase.com/dashboard> → project `wdiuuhsfflragxuurwpk`.

- Thấy màu xanh / biểu đồ chạy bình thường → OK, qua bước 2.
- Thấy chữ **"Project paused"** + nút **"Restore project"** → bấm Restore,
  đợi **1–2 phút** tới khi dashboard hết chữ "Restoring".
  *(Gói free tự ngủ sau ~7 ngày không có request. Nghỉ cuối tuần dài là dính.)*

### Bước 2 — Bật backend

Cửa sổ **PowerShell thứ nhất**:

```powershell
cd "d:\web-ca-nhan\app-lịch\web26a-357-project-master\web26a-357-project-master\calendar\backend"
npm run start:dev
```

**Đợi tới khi thấy dòng này** (thường 5–20 giây):

```
[Nest] ... LOG [NestApplication] Nest application successfully started
```

- Thấy `Error: listen EADDRINUSE ... :3000` → backend cũ còn chạy nền. Tắt nó:
  ```powershell
  Get-NetTCPConnection -LocalPort 3000 -State Listen | Select-Object -Expand OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }
  ```
  rồi chạy lại `npm run start:dev`.
- Thấy `supabaseKey is required` hoặc lỗi kết nối Supabase → quay lại Bước 1
  (Supabase còn ngủ) hoặc kiểm tra `backend/.env`.
- **Để nguyên cửa sổ này mở.** Đóng = tắt backend.

### Bước 3 — Bật frontend

Cửa sổ **PowerShell thứ hai** (song song, đừng đóng cửa sổ backend):

```powershell
cd "d:\web-ca-nhan\app-lịch\web26a-357-project-master\web26a-357-project-master\calendar\frontend"
npm start
```

**Đợi tới khi thấy:**

```
Watch mode enabled. Watching for file changes...
  ➜  Local:   http://localhost:4200/
Application bundle generation complete. [x.xxx seconds]
```

- Thấy `Port 4200 is already in use` → nhấn `y` cho nó chọn cổng khác **hoặc**
  tắt tiến trình cũ giống cách ở Bước 2 (đổi `3000` thành `4200`).

### Bước 4 — Mở app

Chỉ khi **cả hai** cửa sổ đã xong:

- Mở tab mới: `http://localhost:4200`
- Nếu app đang mở sẵn từ trước khi bật máy: bấm **Ctrl + Shift + R**
  (tải lại bỏ cache) — quan trọng, vì tab cũ đang giữ trạng thái lỗi.

---

## 3. Vẫn lỗi? Bảng tra nhanh

| Triệu chứng | Nguyên nhân | Xử lý |
|---|---|---|
| "Không thể xử lý lời mời" ngay lần đầu, thử lại vài lần vẫn thế | Backend chưa chạy / build chưa xong | Xem cửa sổ backend đã có "successfully started" chưa; F12 → Network xem request `respond` |
| Lỗi kèm chờ rất lâu rồi mới báo | Supabase đang ngủ / mạng chậm | Bước 1, bấm Restore, đợi 2 phút |
| Chỉ 1 lời mời cụ thể báo lỗi, cái khác thì được | Lời mời đó đã bị xử lý trước (409) — thông báo cũ kẹt trong localStorage | Bảng thông báo → "Xóa tất cả", hoặc vào nhóm qua Group Workspace |
| Bị đá về trang `/login` kèm `?sessionExpired=1` | Refresh token hết hạn thật | Đăng nhập lại bằng Google |
| Cả lịch cũng trống, không tạo được sự kiện | Backend hẳn là không chạy | Bước 2 |

---

## 4. Bắt lỗi thật (khi cần mình sửa tận gốc)

Lúc bấm Chấp nhận và bị lỗi:

1. F12 → tab **Network**.
2. Tìm dòng `respond` màu đỏ → bấm vào.
3. Ghi lại: **Status** (`0` / `500` / `502` / `504` / `409` / `401`) ở tab
   *Headers*, và nội dung tab **Response** / **Preview**.
4. Chụp luôn dòng log đỏ ở cửa sổ terminal **backend** (nếu có).

Gửi 2 thứ đó là khoanh được đúng nguyên nhân.

---

## Ghi chú

- App **chỉ dùng Supabase (Postgres)** làm database. Không có MongoDB.
  Kênh đăng nhập cũ qua Socket.io + MongoDB (`google-auth-server/` và trang
  `/login-google-socket`) đã bị **gỡ bỏ hoàn toàn** — không còn liên quan.
- Backend đọc cấu hình từ `backend/.env` (xem `backend/.env.example` để biết
  danh sách biến). Frontend cắm sẵn URL Supabase trong
  `frontend/src/environments/environment.ts`.
