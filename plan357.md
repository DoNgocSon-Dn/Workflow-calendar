# Phân công — App Calendar (3 người, làm dài hơi, không ép theo sprint 7 ngày)

## 0. Chốt phạm vi thực tế (đọc trước khi bắt đầu)

File gốc `CALENDAR_APP_PLAN.md` có **10 giai đoạn** (core → personal/team → reminder/conflict → AI → gamification → theme mùa → social MXH → import/export → polish). Không ép hết vào 1 sprint ngắn nữa — chia thành các **giai đoạn (phase)** làm tuần tự, mỗi phase xong mới qua phase sau, không giới hạn cứng số ngày.

**Phase 1 — Core (nền tảng, làm trước tiên):**
- Auth, CRUD calendar/event, Month/Week/Day view
- Invite/accept/decline, chia sẻ lịch
- Realtime WebSocket
- Popup notification (bản rút gọn: modal + toast, chưa cần âm thanh/queue phức tạp)
- Time picker nâng cao (duration presets + clock picker; NLP text parse để **sau**)
- Reminder (multi-reminder, cron job)
- Conflict detection
- Phân nhánh personal/team (chỉ 1-2 tính năng phụ mỗi bên: notes cho personal; comment cho team)
- AI chatbot tạo event bằng text tự nhiên (bản MVP)
- **Gửi email**: mail mời tham gia event + mail nhắc lịch (reminder), có nút **xác nhận (accept/decline) ngay trong email**, không cần mở app/đăng nhập

**Phase 2 — Mở rộng đáng giá (làm sau khi Phase 1 chạy ổn):**
- Import Calendar: Import chuẩn (.ics/.csv) + Smart Import bằng AI (xem mục 8)
- Recurring events, Search, Agenda/List view
- Video call link tự sinh khi tạo event
- Undo/trash cho event bị xóa

**Phase 3 — Mở rộng lớn (tuỳ nhu cầu, có thể làm song song hoặc bỏ qua):**
- Group Workspace: group, chat realtime, task management (xem mục 7)
- Drag-drop, timezone đầy đủ
- Đồng bộ 2 chiều với Google/Outlook Calendar
- Recurring event exceptions (sửa 1 lần vs sửa cả chuỗi)

**Đẩy ra sau cùng / cân nhắc bỏ nếu không phải sản phẩm thương mại:**
- Gamification (streak, points, badge, leaderboard)
- Seasonal themes / theme engine
- Social integration (Facebook/YouTube/TikTok...)
- Advanced collaboration (polling, delegation, activity feed)
- GDPR export/delete, holiday auto-sync, i18n đa ngôn ngữ

---

## 1. Timeline tổng quan (theo giai đoạn, không ép ngày cụ thể)

| Giai đoạn | Nội dung chính | Ghi chú |
|---|---|---|
| **Setup chung** | Supabase, repo, schema, RLS, thống nhất kiến trúc | Cả 3 người ngồi cùng nhau, không bỏ qua bước này |
| **Phase 1.1** | Auth + Core CRUD event/calendar + Calendar grid (Month/Week/Day) + Time picker | Nền tảng, người khác phụ thuộc vào phần này |
| **Phase 1.2** | Realtime WebSocket + Popup notification | Có thể làm song song với 1.1 phần không phụ thuộc (skeleton) |
| **Phase 1.3** | Reminder (cron) + Conflict detection | |
| **Phase 1.4** | Personal/Team split + AI chatbot MVP + Email (mời + reminder + xác nhận) | Phase 1 hoàn chỉnh sau bước này |
| **Tích hợp Phase 1** | Ghép module 3 người, test, sửa lỗi tích hợp | Không giới hạn 1 buffer ngắn — làm tới khi ổn định thật sự |
| **Test Phase 1** | Unit + integration + E2E cho toàn bộ Phase 1 | Xem mục 5 |
| **Phase 2** | Import Calendar (chuẩn + AI) + Recurring + Search + Agenda view + Undo/trash | Xem mục 8 |
| **Test Phase 2** | Test riêng các tính năng mới, test lại tương tác với Phase 1 | |
| **Phase 3** | Group Workspace + các mở rộng lớn khác (tuỳ chọn) | Xem mục 7, có thể làm song song nếu đủ người |
| **Polish & Deploy** | Sửa bug tồn đọng, tối ưu UX, deploy production | |

---

## 2. Phân công theo người (vertical slice — mỗi người giữ cả backend lẫn frontend phần của mình để tránh chờ nhau)

### 👤 Người 1 — "Core Calendar & Auth" (nền tảng, người khác phụ thuộc vào phần này)

**Setup chung (làm cùng cả team):**
- [ ] Tạo Supabase project, bật Auth (email + Google OAuth)
- [ ] Chạy script SQL bảng core: `calendars`, `calendar_members`, `events`, `event_attendees`
- [ ] Bật RLS cơ bản cho các bảng trên
- [ ] Khởi tạo repo Nx monorepo (`apps/api` NestJS, `apps/web` Angular), push lên git cho 2 người kia pull về

**Phase 1.1:**
- [ ] Backend: `AuthModule` (Guard verify Supabase JWT), `CalendarsModule` (CRUD + members), `EventsModule` (CRUD event, chưa cần invite)
- [ ] Frontend: màn hình đăng nhập/đăng ký (Supabase Auth SDK), layout chính (sidebar + header)
- [ ] Frontend: `CalendarGridComponent` — Month/Week/Day view (component core mà Người 2, 3 sẽ dùng lại)
- [ ] Frontend: `EventFormModalComponent` khung sườn (chưa có time picker nâng cao)

**Phase 1.2-1.3 (support role):**
- [ ] Ghép API invite/accept/decline vào EventsModule (`POST /events/:id/invite`, `POST /events/:id/respond`)
- [ ] Hỗ trợ Người 3 nối `EventFormModal` với conflict warning
- [ ] Time picker nâng cao: clock-style picker + duration presets + slider (không cần NLP parse text)

**Phase 1.4:**
- [ ] Chia sẻ lịch (view-only / editable) — bảng `calendar_members` role
- [ ] Support tích hợp AI chatbot của Người 3 (API tạo event dùng chung endpoint `POST /events`)
- [ ] **Email mời + xác nhận trong mail**: khi `POST /events/:id/invite`, gọi `MailService.sendMail()` (module `mail/` đã có sẵn, xem mục 6) gửi mail có 2 nút "Đồng ý" / "Từ chối", bấm trong mail xử lý luôn không cần đăng nhập

**Tích hợp Phase 1:** Ghép nối toàn bộ, fix lỗi tương tác giữa các module — làm tới khi ổn định thật sự, không giới hạn 1 buổi ngắn.

---

### 👤 Người 2 — "Realtime, Notification & Reminder"

**Setup chung:** Cùng setup chung ở trên. Thêm: chạy script SQL bảng `reminders`.

**Phase 1.1 (trong lúc chờ Người 1 xong CRUD event cơ bản, làm phần không phụ thuộc trước):**
- [ ] Dựng `WebSocketService` (Angular, socket.io-client) — kết nối, join room theo calendar
- [ ] Dựng `realtime/calendar.gateway.ts` (NestJS) — verify JWT ở `handleConnection`, room theo `calendar_id`
- [ ] Định nghĩa trước các event: `event:created`, `event:updated`, `event:deleted`, `attendee:invited`, `attendee:statusChanged`

**Phase 1.2:**
- [ ] Nối Gateway: mỗi khi EventsModule (của Người 1) tạo/sửa/xoá event → gọi `gateway.emitToCalendar(...)`
- [ ] Frontend: test 2 tab trình duyệt — sửa tab A thấy cập nhật tab B ngay
- [ ] `NotificationPopupComponent` (modal overlay, nút Xem chi tiết/Bỏ qua/Snooze) — bản rút gọn, queue tối đa hiển thị 1-2 popup, không cần âm thanh
- [ ] Đăng ký Browser Notification API (`Notification.requestPermission()`)

**Phase 1.3:**
- [ ] Backend: `RemindersModule` — CRUD reminder, cron job (NestJS `@Cron`) mỗi 1 phút quét `remind_at <= now() AND is_sent = false`
- [ ] Reminder bắn qua WebSocket → NotificationPopup hiển thị
- [ ] Snooze mechanism (`POST /reminders/:id/snooze`)
- [ ] Multi-reminder UI trong event form (thêm nhiều mức nhắc: 15p, 1h, 1 ngày...)

**Phase 1.4:**
- [ ] Team variant: `event_comments` — bình luận trong event (CRUD + hiển thị realtime qua WS)
- [ ] Personal variant: hỗ trợ Người 1/3 nếu cần (notes)
- [ ] **Email reminder**: khi cron job phát hiện reminder có `remind_type = 'email'` sắp tới → gọi `MailService.sendMail()` gửi mail nhắc lịch (xem mục 6)

**Tích hợp Phase 1:** Test lại toàn bộ luồng realtime + reminder khi đã ghép module.

---

### 👤 Người 3 — "Conflict Detection, Variant Split & AI Assistant"

**Setup chung:** Cùng setup chung. Thêm: chạy script SQL bảng `notes`, `ai_conversations`.

**Phase 1.1 (trong lúc chờ CRUD event cơ bản xong, làm phần không phụ thuộc trước):**
- [ ] Nghiên cứu trước & viết prompt/schema cho AI (xem mục 3 bên dưới)
- [ ] Frontend: `PersonalFeaturesModule` khung sườn — sticky note component (chưa nối data)
- [ ] Frontend: `TeamFeaturesModule` khung sườn — free/busy view đơn giản (chỉ cần list "ai đang rảnh/bận" dạng bảng, chưa cần optimize)

**Phase 1.2:**
- [ ] Backend: `POST /events/check-conflicts` — query overlap (`start_at < newEnd AND end_at > newStart`) cho user + tất cả attendee đã accepted/pending
- [ ] Frontend: `ConflictWarningComponent` — hiển thị inline trong EventFormModal ("⚠️ A đã có event từ 14:00-15:00"), cho phép vẫn tạo

**Phase 1.3:**
- [ ] Highlight visual overlap trên calendar grid (viền đỏ/stripe khi 2 event trùng giờ)
- [ ] Personal: notes CRUD thật (nối bảng `notes`)
- [ ] Team: free/busy thật (nối data từ `events` + `calendar_members`)

**Phase 1.4:**
- [ ] AI chatbot MVP: `AiModule` backend + `ai-assistant` frontend (xem hướng dẫn chi tiết mục 3)
- [ ] UI chat widget nổi (floating), gõ text → tạo event thật qua `POST /events` có sẵn của Người 1

**Tích hợp Phase 1:** Test luồng conflict + AI, fix lỗi tích hợp.

---

## 3. Hướng dẫn tự làm AI Assistant (MVP — bạn tự code phần này)

Mục tiêu MVP: chatbot nhận text tiếng Việt tự nhiên → tạo event thật. Bỏ qua smart-scheduling và template gallery ở Phase 1 (làm sau ở Phase 2/3 nếu còn thời gian).

### Bước 1 — Chọn API và lấy key
- Dùng **Gemini API** (có free tier hào phóng hơn OpenAI cho học tập): vào Google AI Studio → tạo API key.
- Lưu key trong `.env` của `apps/api` (KHÔNG commit): `GEMINI_API_KEY=...`

### Bước 2 — Backend: endpoint parse intent bằng structured output
Tạo `apps/api/src/ai/ai.module.ts`, `ai.service.ts`, `ai.controller.ts`.

Ý tưởng cốt lõi: **không để AI trả lời tự do** — bắt nó trả về JSON đúng schema, rồi code parse JSON đó để gọi `EventsService.create()` thật.

```ts
// ai.service.ts (rút gọn)
async parseEventFromText(userText: string, contextEvents: any[]) {
  const systemPrompt = `
Bạn là bộ phân tích lịch. Nhận câu tiếng Việt của người dùng, trả về DUY NHẤT
một JSON object theo schema sau, không thêm text nào khác:
{
  "intent": "create_event" | "unclear",
  "title": string,
  "start_at": string (ISO 8601, suy luận từ ngày hôm nay: ${new Date().toISOString()}),
  "end_at": string (ISO 8601),
  "attendees": string[] (tên người được nhắc, nếu có),
  "recurrence_rule": string | null
}
Nếu không chắc chắn về thời gian, trả "intent": "unclear".
`;

  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + process.env.GEMINI_API_KEY, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemPrompt}\n\nCâu người dùng: "${userText}"` }] }],
      generationConfig: { responseMimeType: 'application/json' },
    }),
  });

  const data = await response.json();
  const rawJson = data.candidates[0].content.parts[0].text;
  return JSON.parse(rawJson); // luôn bọc try/catch khi dùng thật
}
```

- Endpoint: `POST /ai/chat` — nhận `{ message }`, gọi `parseEventFromText`, nếu `intent === 'create_event'` thì gọi thẳng `EventsService.create(...)` (dùng chung logic Người 1 đã viết, **không** viết logic tạo event riêng cho AI).
- Nếu `intent === 'unclear'` → trả về cho frontend để hiện **form tạo event thủ công điền sẵn phần hiểu được** (fallback bắt buộc, đừng bỏ qua bước này).
- Lưu lịch sử chat vào bảng `ai_conversations` (`messages jsonb`).

### Bước 3 — Rate limit (bắt buộc, tránh tốn tiền/quota)
Dùng `@nestjs/throttler` hoặc tự đếm trong Redis/memory: tối đa **20 request/user/giờ** cho `/ai/chat`.

### Bước 4 — Frontend: chat widget
- Component nổi góc màn hình (floating button → mở panel chat).
- Gửi message → gọi `POST /ai/chat` → nếu backend trả event đã tạo thành công, hiện toast "Đã tạo event: Họp với Hùng, 15:00 thứ 6" + WebSocket sẽ tự đẩy event mới lên calendar (dùng lại pipeline realtime của Người 2, không cần code thêm).
- Nếu `intent: unclear` → mở `EventFormModal` có sẵn, điền sẵn field AI đoán được (title nếu có), để user tự sửa/xác nhận.

### Bước 5 — Test case tối thiểu cho AI (đưa vào phần test half-week)
- "Nhắc tôi họp với Hùng thứ 6 tuần sau lúc 3 giờ chiều" → tạo đúng event, đúng ngày giờ
- "Tạo lịch gì đó" (mơ hồ) → phải rơi vào `unclear`, hiện form thủ công, **không được** tạo event rác
- Gửi 25 request liên tục trong 1 giờ → request thứ 21 trở đi phải bị chặn bởi rate limit

### Việc để làm sau (không cần trong sprint này)
- Smart scheduling (phân tích pattern lịch sử)
- Template gallery
- Onboarding wizard hỏi ngày lễ/sinh nhật

---

## 4. Hướng dẫn làm Email (mời + xác nhận trong mail + reminder email)

Tin vui: file gốc đã có sẵn module mail (`apps/api/src/mail/` — `MailModule`, `MailService`, `MailController`, dùng Nodemailer + Gmail App Password). Không cần viết lại từ đầu, chỉ cần **gọi nó** ở đúng 2 chỗ và thêm route xác nhận không cần đăng nhập.

### 4.1 Setup (làm 1 lần, ai làm cũng được — nên làm ngày 1 cùng lúc setup chung)
- Bật xác thực 2 bước cho Gmail cá nhân (hoặc tạo Gmail riêng cho project).
- Vào `myaccount.google.com/apppasswords` tạo App Password.
- Copy `apps/api/.env.example` → `.env`, điền `GMAIL_USER` và `GMAIL_APP_PASSWORD`.
- Test nhanh bằng endpoint có sẵn `POST /mail/test-send` — **nhớ thêm Auth Guard trước khi deploy công khai**, không thì ai cũng gọi được để spam qua Gmail của bạn.

### 4.2 Email mời tham gia event + xác nhận ngay trong mail (Người 1 phụ trách, ngày 6)

Mục tiêu: người được mời **không cần mở app, không cần đăng nhập** — bấm nút trong email là xong.

**Cơ chế token xác nhận (bắt buộc làm đúng để tránh lỗ hổng bảo mật):**
- Khi tạo lời mời (`POST /events/:id/invite`), sinh thêm 1 token ngẫu nhiên (VD: `crypto.randomUUID()` hoặc JWT ký riêng, hết hạn sau 7 ngày), lưu vào cột mới `event_attendees.respond_token` (hoặc bảng riêng nếu không muốn sửa bảng cũ).
- **Không dùng thẳng `event_id` + `user_id` làm token** — dễ đoán, ai cũng respond hộ người khác được.
- Endpoint mới (không cần JWT Supabase, xác thực bằng chính token):
```
GET /events/:id/respond-via-email?token=xxx&action=accept
GET /events/:id/respond-via-email?token=xxx&action=decline
```
- Trong handler: tìm `event_attendees` theo token → kiểm tra chưa hết hạn, chưa dùng → update status → **đánh dấu token đã dùng** (để không bấm lại được lần 2) → gọi `gateway.emitToCalendar(...)` để mọi người thấy realtime → trả về 1 trang HTML đơn giản "Bạn đã xác nhận tham gia ✅" (không redirect vào app luôn cũng được, làm sau nếu có thời gian).

**Nội dung mail** (gọi `MailService.sendMail({ to, subject, html })` ngay sau khi tạo invite thành công):
```
Chủ đề: [Tên event] mời bạn tham gia
Nội dung: Tiêu đề, thời gian, địa điểm, người mời
[ Nút Đồng ý ]  → link GET .../respond-via-email?token=...&action=accept
[ Nút Từ chối ] → link GET .../respond-via-email?token=...&action=decline
```

### 4.3 Email reminder (Người 2 phụ trách, ngày 6)

- Bảng `reminders` đã có sẵn cột `remind_type` (`'popup' | 'push' | 'email'`) — chỉ cần xử lý nhánh `'email'` trong cron job đã viết ở ngày 5.
- Trong `RemindersModule` cron job: khi `remind_type === 'email'` và đến giờ → gọi `MailService.sendMail()` gửi mail "Sắp tới: [tên event] lúc [giờ]" thay vì (hoặc kèm thêm) bắn WebSocket.
- User bật/tắt email reminder ở `PATCH /reminders/defaults` (endpoint đã có trong plan gốc) — thêm field `default_remind_type`.

### 4.4 Lưu ý bảo mật & giới hạn (đọc kỹ trước khi code)
- Gmail thường giới hạn **~500 mail/ngày** — đủ cho demo/học tập, không dùng cho production gửi hàng loạt thật.
- Token xác nhận: phải **random đủ dài, có hạn dùng, và tự vô hiệu sau khi dùng 1 lần** — nếu không làm đúng, ai có link cũng respond hộ được người khác.
- Không log/expose token ra console hoặc response lỗi.
- Endpoint `respond-via-email` nên rate-limit theo IP để tránh brute-force đoán token.

### 4.5 Test case cho email (thêm vào phần test half-week, mục 5)
- Mời 1 người → nhận được mail, bấm "Đồng ý" → trạng thái đổi thành accepted, người mời thấy update realtime ngay
- Bấm lại link cũ lần 2 (token đã dùng) → phải báo lỗi/hết hạn, không đổi trạng thái lần nữa
- Đặt reminder kiểu email cho event 5 phút nữa → nhận được mail đúng lúc
- Test link hết hạn (giả lập token quá 7 ngày) → báo lỗi rõ ràng, không crash

---

## 5. Kế hoạch test (áp dụng cho Test Phase 1 trong timeline mục 1, lặp lại tương tự khi test Phase 2/3)

**Bước 1 — Test từng module riêng (mỗi người tự test phần mình + code review chéo):**
- [ ] Auth: đăng ký/đăng nhập/OAuth Google, token hết hạn xử lý đúng
- [ ] CRUD event/calendar: tạo/sửa/xoá, validate field bắt buộc
- [ ] Time picker: duration preset, slider, all-day event

**Bước 2 — Test tích hợp (integration, 2-3 người test cùng nhau):**
- [ ] Realtime: mở 2-3 tab/2 tài khoản khác nhau, sửa 1 bên → bên kia cập nhật ngay không reload
- [ ] Invite → accept/decline → cả 2 phía thấy trạng thái đúng
- [ ] Reminder: tạo event 2 phút sau, đặt reminder trước 1 phút → popup bắn đúng lúc
- [ ] Conflict detection: 2 event trùng giờ cùng 1 user và giữa 2 user có attendee chung → warning hiện đúng, vẫn cho tạo
- [ ] AI chatbot: chạy 5 test case ở mục 3 bước 5
- [ ] Email: chạy 4 test case ở mục 4.5

**Bước 3 — Test đầu cuối (E2E) + bug bash:**
- [ ] Luồng đầy đủ: đăng ký → tạo calendar → tạo event → mời người → **người kia nhận mail, bấm xác nhận trong mail** → cả 2 nhận reminder (kể cả email reminder) → conflict warning khi trùng lịch → AI tạo thêm 1 event
- [ ] Test RLS: user A không phải member calendar B thì gọi API phải bị chặn (403), không chỉ ẩn ở UI
- [ ] Test responsive cơ bản (mobile/tablet)
- [ ] List toàn bộ bug tìm được, xếp ưu tiên P0 (chặn demo) / P1 (nên sửa) / P2 (để sau)

**Bước 4 — Sửa bug & deploy:** Sửa bug P0/P1, deploy (NestJS lên Railway/Render, Angular lên Vercel/Netlify), test lại trên môi trường production/staging. Không giới hạn cứng thời gian — làm tới khi ổn định mới coi là xong Phase.

---

## 6. Lưu ý phân công để tránh nghẽn

- Bước **Setup chung bắt buộc cả 3 người ngồi cùng nhau** để thống nhất schema — sửa schema giữa chừng sẽ vỡ tiến độ cả team.
- Người 2 và 3 ở Phase 1.1 chưa có API event thật để nối → làm phần **không phụ thuộc** trước (WebSocket skeleton, nghiên cứu AI prompt, UI khung sườn) để không ngồi chờ Người 1.
- Daily sync 15 phút mỗi buổi làm việc — báo cáo: lần trước làm gì / hôm nay làm gì / đang bị chặn bởi ai. Vì không ép ngày cụ thể nữa, sync đều đặn càng quan trọng để biết Phase nào đang trễ.
- Nếu Phase 1.3 (Reminder + Conflict detection) chưa xong mà core (Người 1+2) vẫn còn vướng, **cắt luôn** phần AI/personal-team của Người 3 xuống bản tối giản nhất để dồn người vào core — core chạy được quan trọng hơn tính năng phụ. Không qua Phase 2 (Import Calendar, Recurring...) khi Phase 1 chưa ổn định.


---

# 7. Đề xuất mở rộng: Group Workspace (Phase 3)

> Đây là phần mở rộng sau khi hoàn thành toàn bộ chức năng cốt lõi (Phase 1) và Phase 2.

## Mục tiêu

Cho phép người dùng tạo một **Group Workspace** để cộng tác trên cùng một lịch, trò chuyện và quản lý công việc.

### Chức năng

- Tạo Group.
- Mời thành viên bằng email hoặc link.
- Phân quyền:
  - Owner
  - Admin
  - Member
  - Guest

### Calendar nhóm

- Calendar riêng của Group.
- Tất cả thành viên có quyền xem.
- Phân quyền chỉnh sửa theo vai trò.

### Chat thời gian thực

- Chat ngay trong Group.
- Hiển thị trạng thái Online/Offline.
- Hỗ trợ emoji, trả lời tin nhắn và đính kèm tệp.

### Task

- Tạo Task.
- Giao việc.
- Deadline.
- Trạng thái (Todo / In Progress / Done).

### AI hỗ trợ

AI có thể:

- Tạo event cho toàn bộ Group.
- Đề xuất thời gian họp không bị trùng lịch.
- Tóm tắt cuộc trò chuyện.
- Nhắc deadline.

### Database bổ sung

- groups
- group_members
- group_messages
- group_message_attachments
- group_tasks
- task_assignees

### API đề xuất

- POST /groups
- GET /groups
- POST /groups/:id/invite
- GET /groups/:id/messages
- POST /groups/:id/messages
- POST /groups/:id/tasks
- PATCH /groups/:id/tasks/:taskId

### Luồng hoạt động

Tạo Group
→ Mời thành viên
→ Chat
→ Tạo Event
→ AI kiểm tra trùng lịch
→ Gửi Notification
→ Gửi Email Reminder

---

# 8. Đề xuất mở rộng: Import Calendar (Phase 2)

> Gộp 2 nhu cầu: import file lịch chuẩn (đã note ở mục "đẩy ra sau") + đọc file lịch trình tự do bằng AI (VD: nhân viên mới nhận file lịch trình công ty từ cấp trên, file không theo chuẩn nào cả). Chung 1 entry point, 2 mode xử lý khác nhau, share chung màn hình preview/confirm.

## Mục tiêu

Cho phép user thêm hàng loạt event vào lịch từ 1 file có sẵn, thay vì tạo tay từng cái. Có 2 chế độ:

- **Import chuẩn**: file `.ics` / `.csv` theo cấu trúc chuẩn (VD xuất từ Google Calendar, Outlook) → parse trực tiếp, chính xác 100%.
- **Smart Import (AI)**: file tự do `.xlsx` / `.docx` / `.pdf` (VD lịch trình công ty do HR soạn tay, không theo chuẩn nào) → AI đọc và trích xuất event.

## Luồng hoạt động chung

```
Chọn mode (chuẩn / AI) → Upload file → Parse (theo mode) → Preview list event
→ User sửa/xóa từng event → Check conflict → Xác nhận → Bulk create vào lịch
```

Cả 2 mode đều đổ chung về 1 màn hình **preview + conflict check + confirm** — chỉ code phần này 1 lần, dùng chung cho cả 2 nhánh.

## So sánh 2 mode

| | Import chuẩn | Smart Import (AI) |
|---|---|---|
| Input | `.ics`, `.csv` | `.xlsx`, `.docx`, `.pdf` |
| Cách đọc | Parse trực tiếp theo field chuẩn | Extract text/table → gửi AI (Gemini) → nhận JSON |
| Tốc độ | Nhanh, không tốn AI token | Chậm hơn, tốn token |
| Độ chính xác | ~100% nếu file đúng chuẩn | Cần user review kỹ, AI có thể đọc sai ngày/giờ |
| Recurring event | `.ics` có `RRULE` sẵn, parse được | AI chỉ nhận diện & note lại, chưa tự tạo recurring thật (nếu app chưa support recurring) |

## Thiết kế backend

- 1 endpoint chung: `POST /calendars/import` — nhận `mode: 'standard' | 'smart'` + file
- Route theo `mode` sang 2 service riêng:
  - `IcsImportService` — parse `.ics`/`.csv` trực tiếp
  - `AiFileImportService` — extract text (dùng `xlsx` cho Excel, `mammoth`/`docx` cho Word, `pdf-parse` cho PDF) rồi gửi AI với prompt structured JSON, tương tự cách làm ở `AiModule` (mục 3) — tận dụng lại code parse JSON đã có
- Cả 2 service trả về cùng format: `{ events: ParsedEvent[], conflicts: [...] }` để frontend render preview giống nhau
- Endpoint bulk tạo thật: `POST /events/bulk-create` (chạy trong 1 transaction, chỉ chạy sau khi user xác nhận ở màn preview)

## Xử lý file dài — BẮT BUỘC chia chunk, không được bỏ sót dữ liệu

**Vấn đề:** không thể bắt AI đọc và trả hết toàn bộ event trong 1 lần gọi API. Với file dài (nhiều sheet, nhiều trang), việc gọi 1 lần duy nhất dễ gặp:
- Response bị cắt giữa chừng do vượt giới hạn output token → JSON lỗi, parse crash, mất hết kết quả
- AI bỏ sót event nằm ở giữa/cuối file khi input quá dài ("lost in the middle")
- 1 lỗi nhỏ ở bước cuối làm hỏng toàn bộ kết quả, user phải import lại từ đầu

**Yêu cầu bắt buộc:** pipeline phải đảm bảo đọc hết 100% nội dung file, không phụ thuộc vào 1 lần gọi AI duy nhất. Thiết kế theo hướng **chunking + gộp kết quả**:

```
File → Chia thành nhiều chunk (theo sheet/trang/khối dòng) → Gọi AI riêng từng chunk
(có thể chạy song song) → Validate JSON từng chunk → Gộp toàn bộ kết quả
→ 1 màn preview tổng
```

Cụ thể:
- **Excel nhiều sheet**: xử lý mỗi sheet 1 lần gọi AI riêng, chạy song song bằng `Promise.all` để nhanh hơn thay vì tuần tự.
- **PDF/Word nhiều trang, không có ranh giới rõ**: chia theo số dòng/ký tự cố định (VD mỗi chunk ~2000-3000 token), có **overlap nhẹ** giữa 2 chunk liền kề để tránh cắt đứt 1 event nằm vắt ngang ranh giới chunk.
- **Validate JSON từng chunk** ngay sau khi nhận — `try/catch` khi `JSON.parse`; chunk nào lỗi thì **retry riêng chunk đó** (tối đa 2-3 lần), không chạy lại toàn bộ file — tiết kiệm token và thời gian.
- **Gộp kết quả** từ tất cả chunk thành 1 mảng `events` duy nhất trước khi đưa vào màn preview, kèm cờ đánh dấu chunk nào đã xử lý thành công / thất bại để user biết phần nào cần tự bổ sung tay nếu retry vẫn fail.
- Set `max_tokens` đủ rộng cho mỗi lần gọi, nhưng vẫn phải chunk — không dựa hoàn toàn vào việc tăng giới hạn token để né vấn đề.

**Các lưu ý khác:**
- **Không tạo event ngay** — bắt buộc qua màn preview cho user sửa/xóa trước khi lưu thật, vì AI đọc sai ngày/giờ từ file lộn xộn là chuyện gần như chắc chắn xảy ra.
- Field nào AI không chắc chắn → đánh dấu `needs_review: true`, highlight riêng trong preview để user chú ý.
- Chạy `check-conflicts` (đã có sẵn từ mục Người 3) cho toàn bộ event trong preview trước khi bulk-create, hiện warning ngay tại đó.
- Giới hạn số event tối đa mỗi lần import, tránh AI hallucinate ra event rác từ file lỗi.
- Phiên bản đầu chỉ cần support file có text thật (xlsx/docx/pdf text-based). File ảnh/scan cần OCR thêm — để version sau nếu có thời gian.

## Database bổ sung

- Không cần bảng mới bắt buộc — dùng lại `events`, `event_attendees` hiện có.
- Có thể thêm bảng `import_jobs` (tuỳ chọn) để lưu lịch sử import: `id, user_id, mode, file_name, status, created_at` — hữu ích nếu muốn cho user xem lại các lần import trước hoặc rollback.

## API đề xuất

- `POST /calendars/import` — upload file + mode, trả về preview (chưa lưu DB)
- `POST /events/bulk-create` — xác nhận, lưu thật hàng loạt event
- `GET /calendars/import/history` (tuỳ chọn) — lịch sử các lần import

---

# 9. Ý tưởng đột phá — AI nâng cao & Email 2 chiều (Phase 3+, không bắt buộc)

> Mảng calendar app đã bão hòa (Google/Notion/Cal.com đều mạnh), nên khó "đột phá" toàn diện. Các ý dưới đây tận dụng đúng hạ tầng đã có sẵn trong plan (AI module, hệ thống email, realtime, conflict detection, free/busy) để tạo khác biệt, thay vì thêm tính năng mới tốn công build từ đầu. Xếp theo độ khả thi/giá trị, ưu tiên 9.1 và 9.2 trước.

## 9.1 AI chủ động đề xuất, không chỉ phản ứng theo lệnh

Hiện tại AI chatbot (mục 3) chỉ đóng vai thư ký thụ động — user gõ gì AI làm nấy. Nâng cấp: AI tự phân tích lịch và chủ động gợi ý.

**Các luồng gợi ý:**
- **Gợi ý slot rảnh**: cuối ngày/tuần, cron job quét lịch user → AI phân tích khung giờ trống → gợi ý qua notification/email ("Tuần sau bạn có 3 slot rảnh buổi chiều, muốn dồn task nào vào đó?")
- **Tìm giờ họp chung**: khi tạo event có nhiều attendee, thay vì bắt user tự nhìn free/busy view (đã có ở mục Người 3) — AI tự đọc data đó, đề xuất luôn 2-3 khung giờ tất cả đều rảnh, hiện ngay trong `EventFormModal`
- **Phát hiện pattern hành vi**: theo dõi lịch sử event bị dời/huỷ (cần thêm log nhẹ) → AI nhận diện pattern lặp lại ("Bạn hay bị trễ họp 9h sáng") → gợi ý điều chỉnh, không tự động làm thay

**Thiết kế kỹ thuật:**
- Endpoint mới: `POST /ai/suggest-schedule` — nhận `calendar_id` + khoảng thời gian, trả về gợi ý dạng JSON structured (tương tự cách làm ở `AiModule` hiện có)
- Cron job riêng (`AiSuggestionCron`) chạy định kỳ, không chặn luồng chính, kết quả gửi qua kênh đã có sẵn (notification popup / email)
- **Luôn ở dạng gợi ý, không tự hành động** — AI không tự dời/xoá event của user, chỉ đề xuất và chờ xác nhận, tránh phá vỡ lịch trình ngoài ý muốn

## 9.2 Email 2 chiều — không chỉ xác nhận, mà tương tác qua reply

Mục 4 đã có cơ chế xác nhận invite ngay trong email (1 chiều: click nút). Nâng cấp lên 2 chiều: cho phép **reply email bằng câu tự nhiên** để thao tác với event, không cần mở app.

**Luồng hoạt động:**
```
User reply email (VD: "Mai đổi sang 3h được không?")
→ Hệ thống nhận qua webhook/IMAP polling
→ Gửi nội dung reply cho AI parse thành structured intent (giống AiModule)
→ Cập nhật event (nếu hợp lệ) → gửi mail xác nhận lại
→ Bắn realtime cho các attendee khác đang mở app
```

**Thiết kế kỹ thuật:**
- Cần đổi từ SMTP gửi thuần (Nodemailer hiện có) sang có thêm khả năng **nhận mail** — dùng dịch vụ hỗ trợ inbound email parsing (VD: SendGrid Inbound Parse, Mailgun Routes) thay vì tự dựng IMAP polling để đỡ phức tạp
- Mỗi mail gửi đi cần 1 **reply-to address định danh theo token** (tương tự `respond_token` ở mục 4.2) để hệ thống biết reply này ứng với event/attendee nào
- Giới hạn phạm vi thao tác qua email: chỉ cho đổi giờ/xác nhận/huỷ — không cho tạo event mới qua kênh này (tránh spam/lạm dụng)
- Cùng nguyên tắc an toàn như mục 4.4: rate-limit theo email gửi tới, không tự động thực thi nếu AI không chắc chắn ý định (trả `intent: "unclear"` thì gửi mail hỏi lại thay vì đoán)

**Giá trị:** giải quyết đúng vấn đề thực tế — người ngoài công ty/khách hàng không cần cài app hay tạo tài khoản vẫn tương tác được trọn vẹn với lịch hẹn.

## 9.3 Lịch "sống" theo ngữ cảnh (ý tưởng, chưa thiết kế chi tiết)

- Event tự gợi ý mức ưu tiên/màu sắc dựa trên AI đọc `description` (khẩn cấp, quan trọng, thường)
- Khi mở event sắp diễn ra, tự hiện gợi ý liên quan: note cũ, file đính kèm lần họp trước với cùng attendee

→ Công sức bỏ ra khá lớn so với giá trị tăng thêm, chỉ nên làm nếu dư thời gian sau khi 9.1, 9.2 ổn định.

## 9.4 Lịch trình công ty tự đồng bộ, không chỉ import 1 lần (ý tưởng, chưa thiết kế chi tiết)

- Mở rộng từ Smart Import (mục 8): thay vì import 1 lần từ file tĩnh, thiết lập watch email/folder — công ty gửi file lịch mới định kỳ → hệ thống tự chạy lại pipeline AI import → so sánh với lịch cũ (diff), chỉ báo phần thay đổi để user review thay vì tạo trùng toàn bộ

→ Cùng mức ưu tiên thấp như 9.3 — thú vị nhưng nên để cuối roadmap.
