# Deploy lên internet (Vercel = frontend, Render = backend)

Hiện Vercel mới chạy **frontend tĩnh**. Backend NestJS (socket.io, gửi mail, RPC
Supabase) chưa deploy ở đâu → web trên Vercel gọi API vào URL rác + đăng nhập bị
đá về `localhost`. Làm hết các bước dưới là chạy được thật.

Kiến trúc sau khi xong:

```
Trình duyệt  ──►  Vercel (frontend Angular)  ──►  Render (backend NestJS)  ──►  Supabase
                       │                                                          ▲
                       └──────────── Supabase Auth (OAuth, session) ──────────────┘
```

---

## 1. Backend → Render

Repo đã có sẵn `render.yaml` và script build.

1. Đảm bảo nhánh `master` của repo `Workflow-calendar` đã được **push lên GitHub**
   (kèm `render.yaml`, `frontend/scripts/set-env.mjs`, `calendar/vercel.json` mới).
2. Vào <https://dashboard.render.com> → **New → Blueprint** → chọn repo `Workflow-calendar`.
   Render đọc `render.yaml`, tạo service **`workflow-calendar-api`** (gói Free).
3. Ở phần **Environment Variables**, điền (lấy từ `backend/.env` trên máy):

   | Biến | Giá trị |
   |---|---|
   | `SUPABASE_URL` | `https://wdiuuhsfflragxuurwpk.supabase.co` |
   | `SUPABASE_ANON_KEY` | (trong backend/.env) |
   | `SUPABASE_SERVICE_ROLE_KEY` | (trong backend/.env) |
   | `GMAIL_USER` / `GMAIL_APP_PASSWORD` | (trong backend/.env) |
   | `GEMINI_API_KEY` | (trong backend/.env) |
   | `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | (trong backend/.env) |
   | `SYSTEM_NOTIFICATION_TOKEN` | (trong backend/.env, hoặc để trống) |
   | `API_BASE_URL` | **điền sau bước 4** |
   | `CORS_ORIGIN` | **điền sau bước 6** (tạm để trống) |

4. Bấm **Deploy**. Xong sẽ có URL, ví dụ `https://workflow-calendar-api.onrender.com`.
5. Quay lại Environment → đặt `API_BASE_URL = https://workflow-calendar-api.onrender.com`
   → **Save** (service tự deploy lại). Biến này để link "Đồng ý/Từ chối" trong email
   mời trỏ đúng chỗ.
6. Kiểm tra: mở `https://workflow-calendar-api.onrender.com/` → thấy phản hồi (không 404).

> Gói Free: service ngủ sau ~15 phút không request, lần gọi kế mất ~30–50s để dậy.
> Muốn luôn sẵn sàng thì nâng gói hoặc ping định kỳ.

### ⚠️ Nếu tạo service THỦ CÔNG (không qua Blueprint)

`render.yaml` chỉ được đọc khi deploy qua **New → Blueprint**. Nếu bạn tự tạo
"New → Web Service", phải điền tay trong **Settings**:

| Field | Giá trị ĐÚNG |
|---|---|
| **Root Directory** | `backend`  ← **KHÔNG** phải `calendar/backend` hay `/backend`. Trong repo GitHub `Workflow-calendar`, thư mục backend nằm ngay gốc. |
| **Build Command** | `npm ci --include=dev && npm run build` |
| **Start Command** | `npm run start:prod` |
| **Branch** | `master` |

Lỗi `Root directory "backend" does not exist` = field Root Directory đang sai
(thường bị điền thành `calendar/backend` theo đường dẫn trên máy).

---

## 2. Frontend → Vercel

1. Vercel project của repo này: **Settings → General → Root Directory = `.`**
   (file `calendar/vercel.json` đã set `buildCommand` + `outputDirectory`).
2. **Settings → Environment Variables** → thêm:

   | Biến | Giá trị |
   |---|---|
   | `API_URL` | `https://workflow-calendar-api.onrender.com` (URL Render ở bước 1.4) |

   (Không cần đặt `SUPABASE_URL` / `SUPABASE_ANON_KEY` / `VAPID_PUBLIC_KEY` — đã có
   mặc định đúng trong `set-env.mjs`. Đặt vào nếu sau này đổi project Supabase.)
3. **Deployments → Redeploy** (bỏ chọn "use existing build cache").
4. Build sẽ chạy: `npm ci` → `node frontend/scripts/set-env.mjs` (ghi `apiUrl` = `$API_URL`)
   → `ng build`. Xem log có dòng `set-env.mjs: apiUrl = https://...onrender.com`.

---

## 3. Supabase Auth (bắt buộc — nếu không login vẫn về localhost)

<https://supabase.com/dashboard> → project `wdiuuhsfflragxuurwpk` → **Authentication → URL Configuration**:

- **Site URL**: `https://<tên-app>.vercel.app`
- **Redirect URLs** (thêm cả hai để vừa chạy local vừa chạy prod):
  - `https://<tên-app>.vercel.app/**`
  - `http://localhost:4200/**`

Lưu lại.

---

## 4. Google OAuth (nếu đăng nhập bằng Google)

Google Cloud Console → **APIs & Services → Credentials** → OAuth 2.0 Client:

- **Authorized redirect URIs** phải có:
  `https://wdiuuhsfflragxuurwpk.supabase.co/auth/v1/callback`

(Đây là callback của Supabase, không phải của Vercel — thường đã có sẵn từ lúc bật
Google provider. Không cần thêm domain Vercel ở đây.)

---

## 5. Kiểm tra

1. Mở `https://<tên-app>.vercel.app` → Đăng nhập → phải quay lại **đúng domain Vercel**
   (không phải localhost).
2. Lịch load được sự kiện (backend Render trả JSON).
3. Tạo sự kiện → mời một email ngoài → email tới, có nút Đồng ý/Từ chối trỏ về
   `https://workflow-calendar-api.onrender.com/...`, và sự kiện vào Google Calendar
   của người nhận (cần đã chạy migration `37_event_attendees_external_email.sql`).

---

## Lưu ý về DB

Toàn bộ 3 môi trường (local, Render, Vercel) **dùng chung 1 Supabase project**. Chạy
migration mới **một lần** trên Supabase SQL Editor là cả 3 nơi cùng có. Không có DB
riêng cho "production".
