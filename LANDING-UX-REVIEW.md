> **CẬP NHẬT 24/08/2026 — đã sửa.** Phần lớn các mục dưới đây đã được xử lý.
> Xem [phần "Đã sửa những gì"](#đã-sửa-những-gì) ở cuối file để biết mục nào
> xong, mục nào còn lại và vì sao.

# Đánh giá UI/UX — Landing Page (Workflow)

**Ngày:** 24/08/2026
**Phạm vi:** `frontend/src/app/features/landing/landing-page/` (`.html` 550 dòng · `.css` 2581 dòng · `.ts` 659 dòng)
**Cách kiểm tra:** đọc toàn bộ source + chạy thật trên `localhost:4200`, đo bằng DOM (Chrome, viewport 1536×826, dark theme).
**Lưu ý:** bản được đánh giá là **working tree hiện tại** (có thay đổi chưa commit), không phải bản ở commit `4747919`.

---

## Tóm tắt một đoạn

Trang này có gu thẩm mỹ tốt và tay nghề CSS cao — bảng màu kỷ luật (một accent duy nhất, dẫn xuất bằng `color-mix`), typography có ý đồ, phần scrollytelling 3D là thứ hiếm ai làm tới nơi. Vấn đề không nằm ở "đẹp hay xấu", mà ở chỗ **hiệu ứng đang lấn át công việc mà trang phải làm**: nút CTA chính có thể vô hình, 47% chiều dài trang dành cho một section, section "Showcase" không có hình nào, và mobile không có menu. Nói ngắn gọn: đây đang là một **showreel kỹ thuật**, chưa phải một **landing page bán hàng**.

**Điểm theo hạng mục** (thang 10):

| Hạng mục | Điểm | Ghi chú |
|---|---|---|
| Thẩm mỹ / craft | 8.0 | Màu, chữ, chi tiết đều chắc tay |
| Độ tin cậy (robustness) | 3.5 | CTA phụ thuộc animation; overlay chặn click |
| Kiến trúc thông tin | 4.5 | Trang quá dài, `#features` rỗng, không có proof |
| Sức thuyết phục / conversion | 4.0 | Không ảnh, không social proof, 3 nhãn CTA khác nhau |
| Responsive | 3.5 | Mobile mất hoàn toàn navigation |
| Accessibility | 4.5 | Không có focus style, reduced-motion làm nửa vời |
| Sức khoẻ code | 5.0 | ~180 dòng CSS trùng lặp, nhiều rule chết |

---

# P0 — Lỗi thật, cần sửa trước

### 1. Nút CTA chính có thể **vô hình** — đây là lỗi nặng nhất của trang

Toàn bộ `.hero-sub` và `.hero-cta` để `opacity: 0` trong CSS và chỉ được bật lên bởi timeline GSAP (`landing-page.ts:207-217`, mốc `CUE.sub = 1.35s`, `CUE.cta = 1.6s`).

Timeline chạy bằng `requestAnimationFrame`. Khi tab **không hiển thị** (mở bằng Ctrl+Click, khôi phục phiên, hoặc người dùng chuyển tab trong lúc trang load — cực kỳ phổ biến), rAF bị trình duyệt bóp lại gần như đứng.

Đo thật trên máy, tab ở trạng thái `visibilityState = hidden`:

```
.hero-sub  → opacity = 0     ← mất tiêu đề phụ
.hero-cta  → opacity = 0     ← MẤT NÚT "Bắt đầu miễn phí"
#preloader → opacity = 0.0059, display = flex   ← không bao giờ bị ẩn
html.classList = "dark is-loading"              ← không bao giờ được gỡ
```

Người dùng quay lại tab và nhìn thấy: một cái tiêu đề to đùng, và **không có gì để bấm**.

### 2. Lớp phủ trong suốt nuốt hết click trên hero

Hệ quả trực tiếp của (1). `#preloader` có `z-index: 9999`, `pointer-events: auto`, `inset: 0` — nó chỉ được `display:none` trong callback `onComplete` của timeline (`landing-page.ts:180-182`).

```
document.elementFromPoint(giữa màn hình) → DIV.preloader-mark
```

Trong suốt khoảng thời gian đó, mọi cú click vào hero (kể cả nút CTA, nếu nó hiện) đều rơi vào một tấm kính vô hình.

> **Nguyên tắc:** nội dung có giá trị chuyển đổi cao nhất trên trang không bao giờ được phụ thuộc vào việc một animation chạy xong. Trạng thái mặc định của CSS phải là **đã hiện**; animation chỉ nên là lớp trang trí thêm vào.

### 3. Khoá cuộn của preloader là **rule chết** (Angular scoping)

`landing-page.css:980-981` viết `html.is-loading, html.is-loading body { overflow: hidden }`. Component dùng `ViewEncapsulation.Emulated` mặc định, nên Angular biên dịch nó thành:

```css
html.is-loading[_ngcontent-ng-c1227969573],
html.is-loading[_ngcontent-ng-c1227969573] body[_ngcontent-ng-c1227969573] { ... }
```

`<html>` và `<body>` không bao giờ mang attribute đó → **rule không bao giờ khớp**. Ý định "khoá cuộn khi đang load" thực tế không hoạt động.

Cùng lỗi này còn giết thêm:
- `::selection` (`css:61`) — màu bôi đen tuỳ chỉnh không có tác dụng.
- `::view-transition-old/new(root)` (`css:1106`, `css:1409`) — hiệu ứng chuyển theme hình tròn không chạy từ file này. Nó chỉ hoạt động **nhờ ăn ké** bản copy không bị scope trong `login-page.css`. Xoá login-page là landing gãy theo mà không ai biết tại sao.

### 4. Mobile không có navigation

`landing-page.css:1197-1199`:

```css
@media (max-width: 860px) {
  .landing-nav .links { display: none; }
}
```

Trong HTML **không có** nút hamburger, không có drawer, không có menu thay thế (đã kiểm tra DOM: không tồn tại element nào khớp `[class*=burger]`, `[class*=menu-toggle]`, `[class*=mobile-menu]`).

Người dùng mobile mất hẳn 4 mục điều hướng, chỉ còn cách cuộn tay qua **13,7 màn hình** nội dung.

### 5. Không có bất kỳ `:focus` style nào

`grep -n "focus" landing-page.css` → **0 kết quả**.

Cả trang không có một style focus nào. Điều hướng bằng bàn phím gần như bất khả thi — và với nền tối, focus ring mặc định của trình duyệt cũng rất khó thấy. Đây là mục A tiêu chuẩn WCAG 2.4.7.

---

# P1 — Vấn đề UX & kiến trúc thông tin

### 6. Trang dài 13,7 màn hình, một section chiếm 47%

Đo thật (viewport 826px):

| Section | Chiều cao | % trang |
|---|---:|---:|
| hero | 854px | 7,6% |
| marquee | 70px | 0,6% |
| **#features** | **655px** | **5,8%** |
| **#scrolly** | **5284px** | **46,7%** |
| #showcase | 1607px | 14,2% |
| #process | 993px | 8,8% |
| #trust | 1031px | 9,1% |
| CTA + footer | 815px | 7,2% |
| **Tổng** | **11308px** | 13,7 màn hình |

`.scrolly.is-enhanced { height: 640svh }` (`css:1490`) — **6,4 màn hình cuộn để xem 5 slide**. Trung bình 1,28 màn hình cuộn cho mỗi slide. Người dùng không biết mình đang ở đâu trong đó, và `stage-dots` chỉ báo thì `aria-hidden` + rất mờ.

**Đề xuất:** hạ xuống ~400svh (0,8 màn hình/slide) hoặc cắt còn 3 stage. Cân nhắc cho phép click vào `stage-dots` để nhảy stage.

### 7. `#features` là một màn hình gần như trống

Section này chỉ có kicker + tiêu đề + 2 dòng mô tả, rồi hết — nhưng vẫn chiếm 655px vì `.section-pad { padding: 180px 6vw }` (`css:429`).

Nhìn thật: nửa phải màn hình trống trơn, nửa dưới trống trơn. Và bấm "Tính năng" trên nav đưa người dùng tới **một cái tiêu đề**, sau đó họ phải cuộn thêm 6,4 màn hình nữa mới hết nội dung tính năng.

**Đề xuất:** gộp `#features` làm phần mở đầu của `#scrolly` (dùng chung một anchor), hoặc biến nó thành lưới 4 thẻ tóm tắt để nó tự đứng được.

### 8. Section tên "Showcase" mà không có một tấm hình nào

Đây là mâu thuẫn lớn nhất về nội dung. "Showcase" hứa hẹn *cho xem*, nhưng cả 6 thẻ đều là **tag + tiêu đề + đoạn văn**. Toàn bộ trang cũng vậy: không có một ảnh chụp màn hình sản phẩm nào ngoài cái bảng lịch 3D dựng bằng CSS.

Đây là sản phẩm **lịch** — thứ mà giá trị nằm ở chỗ *nhìn thấy nó đẹp và gọn*. Không cho xem giao diện thật là bỏ phí lợi thế lớn nhất.

**Đề xuất (ưu tiên cao nhất về conversion):** thêm ảnh/GIF giao diện thật vào hero và vào từng thẻ showcase.

### 9. Ba nhãn khác nhau cho cùng một hành động

| Vị trí | Nhãn | Đích |
|---|---|---|
| `html:58` nav | "Dùng thử miễn phí" | `/login` |
| `html:92` hero | "Bắt đầu miễn phí" | `/login` |
| `html:526` CTA cuối | "Bắt đầu ngay" | `/login` |

Ba cách gọi cho một nút. Chọn **một** và dùng thống nhất — lặp lại cùng một nhãn là cách xây dựng trí nhớ, không phải sự nhàm chán.

Ngoài ra: **chỉ có đúng một CTA duy nhất** trong hero. Class `.btn-ghost` đã được style đầy đủ (`css:304-318`) nhưng **không được dùng ở đâu cả** — vốn dĩ chỗ đó là để đặt CTA phụ ("Xem demo" / "Xem tính năng").

### 10. Không có bất kỳ social proof nào

Không có: số người dùng, testimonial, logo trường/tổ chức, số liệu, FAQ, so sánh với Google Calendar. Với một sản phẩm yêu cầu đăng nhập Google, người lạ không có lý do gì để tin.

Ít nhất nên có một dòng kiểu *"Đang được N sinh viên/nhóm dùng"* hoặc một khối FAQ ngắn (miễn phí thật không? dữ liệu của tôi đi đâu? có xoá tài khoản được không?).

### 11. Preloader bắt người dùng đợi ~4,5 giây

`landing-page.ts:138-148`:

```
LETTER_REVEAL_DONE  900ms
WORD_HOLD           500ms
+ 550 + MARK_HOLD   1100ms
────────────────────────────
2500ms  ← trước khi timeline intro MỚI BẮT ĐẦU
+ timeline chạy tới CUE.cta = 1.6s + duration 0.9s
════════════════════════════
≈ 4.500ms  trước khi nút CTA hiện ra
```

Cộng thêm thời gian bootstrap Angular. Chụp màn hình lúc T+5s vẫn chỉ thấy chữ "W" trên nền đen.

Preloader intro là mốt của portfolio cá nhân. Trên trang bán sản phẩm, nó là **thuế thu trên mọi lượt truy cập**. Và nó thu nhiều nhất từ người quay lại lần thứ hai, thứ ba.

**Đề xuất:** rút còn ≤1,2s, và chỉ chạy một lần (đặt cờ trong `sessionStorage`).

### 12. `prefers-reduced-motion` mới làm được một nửa

Ba khối reduced-motion (`css:921`, `css:2319`, `css:2571`) chỉ tắt: `.cta-glow`, `.cta-badge-dot`, `.cta-stars`, `.board-wrap`, `.cmd-caret`, `.warn-badge`, `.fx-blob`, `.fx-sweep`, `.fx-drop`.

**Vẫn chạy nguyên** khi người dùng bật "giảm chuyển động":

| Thứ đang chạy | Ở đâu |
|---|---|
| `.marquee` — băng chữ chạy vô hạn 26s | `css:400-405` |
| `.particle` — 16 hạt bay lơ lửng | `ts:306-320` (không có guard) |
| `.scroll-hint .bar` — vạch nhấp nháy | `css:336-343` |
| `.grid-ring` — xoay 360° / 40s vô hạn | `ts:277-280` (không có guard) |
| `.orb` — phồng xẹp vô hạn | `ts:272-275` (không có guard) |
| Nút "nam châm" bám chuột | `ts:604-618` (không có guard) |
| Thẻ nghiêng 3D theo chuột | `ts:620-643` (không có guard) |

Trớ trêu là **băng marquee chạy ngang là thứ gây khó chịu nhất** cho người nhạy cảm với chuyển động, và nó lại không bị tắt. Nên gom hết vào một guard chung trong `ngAfterViewInit` thay vì rắc lẻ tẻ.

### 13. Con trỏ chuột tuỳ chỉnh

`.cursor-ring` / `.cursor-dot` (`ts:571-600`). Đã tắt đúng trên `pointer: coarse` — tốt. Nhưng trên desktop nó vẫn là một lựa chọn đánh đổi: vòng tròn có `transition 0.4s` nên **luôn tụt lại sau con trỏ thật**, tạo cảm giác trang bị lag ngay cả khi không lag. Nó cũng thêm 2 element chạy `quickTo` trên mọi `mousemove`.

Nếu giữ, cân nhắc rút thời gian đuổi theo xuống ~0.15s.

---

# P2 — Chi tiết thị giác

### 14. Thẻ Showcase lệch hàng thấy rõ

Đo thật vị trí `<h5>` tính từ mép trên thẻ:

| Hàng | Thẻ 1 | Thẻ 2 | Lệch |
|---|---:|---:|---:|
| 1 | 137px | 137px | 0 |
| **2** | **114px** | **160px** | **46px** ← |
| 3 | 137px | 137px | 0 |

Hai thẻ cạnh nhau trong cùng một hàng có tiêu đề lệch nhau 46px. Nhìn ra là *hỏng*, không phải *có ý đồ*.

Nguyên nhân: `justify-content: space-between` + `.tag { margin-bottom: auto; padding-bottom: 48px }` (`css:636-637`) khiến vị trí tiêu đề phụ thuộc vào việc đoạn văn dài mấy dòng. Thẻ 2 hàng 2 hẹp hơn (558px vs 756px) → văn bản xuống nhiều dòng hơn → tiêu đề bị đẩy xuống.

**Cách chữa:** bỏ `space-between`, xếp nội dung từ trên xuống và cho `<p>` `margin-top: auto`, hoặc dùng CSS Grid với `grid-template-rows` cố định để tag/h5/p neo cùng hàng.

### 15. Chữ trong thẻ chỉ dùng ~40% chiều rộng thẻ

`.gallery-card p { max-width: 280px }` (`css:651`) trong khi thẻ rộng 558–756px.

| Thẻ | Rộng | Rộng chữ | Tỉ lệ |
|---|---:|---:|---:|
| Hàng 2 thẻ 1 | 756px | 280px | 37% |
| Hàng 3 thẻ 2 | 734px | 280px | 38% |
| Hàng 1 | 657px | 280px | 43% |

280px là ~35 ký tự/dòng — quá hẹp, dưới ngưỡng dễ đọc (45–75 ký tự) và để lại một mảng trống lớn bên phải mỗi thẻ. Nên nới lên `max-width: 42ch` (~380px) hoặc bỏ hẳn và dựa vào padding của thẻ.

### 16. Khoảng trống ~88px giữa tag và tiêu đề trong mỗi thẻ

`.tag` kết thúc ở y≈49, `<h5>` bắt đầu ở y≈137. Gần 90px không có gì. Vốn dĩ chỗ này để dành cho **hình minh hoạ** — nhưng hình chưa bao giờ được thêm vào, nên thẻ trông như bị thiếu nội dung. Xem lại mục (8).

### 17. Hai hệ thẻ khác nhau trên cùng một trang

| | `.gallery-card` / `.trust-card` | `.process-step` |
|---|---|---|
| Nền | `color-mix(accent 5%, --card)` | `var(--bg)` (bằng nền trang) |
| Bo góc | 20px, từng thẻ riêng | 24px, chỉ bo mép ngoài của cả lưới |
| Ngăn cách | gap 32px / 22px | hairline 1px |
| Hover | nâng lên + đổi viền | không có |

Ba section liền nhau dùng hai ngôn ngữ thẻ khác nhau. Nên thống nhất một cái, hoặc phân biệt có chủ đích và nhất quán (ví dụ: thẻ nổi = tính năng, thẻ phẳng = quy trình).

### 18. Vạch trang trí ở `#process` không khớp lưới nội dung

`.fx-rule` đặt ở 12%, 31%, 50%, 69%, 88% (`html:399-403`) → x ≈ 180, 466, 753, 1040, 1327px.
Lưới 4 cột của `.process-grid` chia ở x ≈ 421, 752, 1082px.

Chỉ có đúng **một** vạch (50%) trùng. Bốn vạch còn lại lệch 45–90px so với đường chia thẻ. Vạch trang trí gần-trùng-mà-không-trùng đọc ra là **lỗi render**, không phải là lưới. Hoặc cho khớp đúng, hoặc đẩy lệch hẳn đi để rõ là cố ý.

### 19. Mũi tên nối các bước gần như vô hình

`.process-arrow { color: var(--line) }` (`css:713`) — `--line` là `rgba(246,245,241,0.13)`, tức mũi tên mờ hơn cả chữ mờ nhất trên trang. Ý tưởng "01 → 02 → 03 → 04" là ý tưởng tốt nhưng không truyền đạt được vì không ai thấy mũi tên.

Ngoài ra chúng đặt `top: 44px` — canh theo con số chứ không canh giữa thẻ, nên trông như trôi lơ lửng.

### 20. Thang chữ có ba cỡ "display" cạnh tranh nhau

| Element | `font-size` | Max |
|---|---|---:|
| `.hero h1` | `clamp(38px, 7.5vw, 104px)` | 104px |
| `.cta-section h2` | `clamp(40px, 7vw, 96px)` | 96px |
| `.section-title` | `clamp(28px, 4.2vw, 58px)` | 58px |
| `.copy-step h3` | `clamp(26px, 3.2vw, 42px)` | 42px |

CTA cuối trang (96px) gần bằng hero (104px) nhưng tiêu đề section giữa lại chỉ 58px. Nhịp bị gãy: to → nhỏ → to. Nên có một thang rõ ràng, ví dụ 96 / 56 / 36 / 24, và để hero là thứ duy nhất ở bậc cao nhất.

### 21. Dòng 2 của H1 màu xám đọc ra như bị "vô hiệu hoá"

`.hero h1 em { color: var(--ink-dim) }` (`css:262-267`) → `#9ca3af`. Trên hero, "Thời gian của bạn," trắng sáng còn "sắp xếp lại." xám mờ — mà "sắp xếp lại" mới là **lời hứa của sản phẩm**. Đang làm mờ đúng cái phần đáng nhấn.

Cùng vấn đề với `.section-title .dim`. Nếu muốn giữ hiệu ứng hai tông, nên nâng tông mờ lên (~88% của `--ink`) thay vì tụt hẳn xuống token chữ phụ.

### 22. Hero: "Kéo xuống" dính sát nút CTA

Đo: nút CTA kết thúc ở y=685, "KÉO XUỐNG" bắt đầu ở y=709 — cách nhau **24px**. Hai thứ có vai trò hoàn toàn khác nhau (một cái là hành động chính, một cái là gợi ý phụ) mà đứng gần như một cụm. Nhìn qua tưởng "Kéo xuống" là caption của cái nút.

### 23. CTA cuối: mô tả dính vào tiêu đề

Khoảng cách badge→H2 ≈ 40px, H2→mô tả ≈ 15px, mô tả→nút ≈ 40px. Đoạn mô tả bị hút vào tiêu đề thay vì đứng thành một khối riêng. Nhịp dọc nên là: badge → 32 → H2 → 24 → sub → 40 → nút.

### 24. Vạch lưới trang trí ở CTA hiện thành mảnh vụn

Ở section CTA cuối nhìn thấy vài đoạn thẳng đứng/ngang rời rạc (một đoạn ở x≈710 phía trên, một đoạn ở x≈422 phía dưới) thay vì một lưới liền mạch. Mask gradient của `.cta-grid` đang cắt lưới thành mảnh, đọc ra như artifact render chứ không như hoạ tiết.

### 25. Trộn tiếng Việt / tiếng Anh không theo quy tắc

- Nav: "Tính năng", "Quy trình", "Bảo mật" (Việt) — nhưng "**Showcase**" (Anh).
- Tag thẻ: "IMPORT LỊCH", "NHẮC NHỞ", "CÁ NHÂN & ĐỘI NHÓM" (Việt) — nhưng "**GROUP WORKSPACE**" (Anh).
- Câu văn: *"không ai **respond** hộ được người khác"* (`html:466`) — chèn động từ tiếng Anh giữa câu tiếng Việt.

Chọn một chuẩn. Nếu giữ thuật ngữ tiếng Anh thì giữ nhất quán cho cả nhóm cùng loại.

### 26. Nội dung phần "Bảo mật" viết cho lập trình viên, không phải cho người dùng

> "Phân quyền theo hàng (RLS)" · "Kết nối WebSocket được xác thực JWT ngay khi mở, mỗi calendar là một room riêng" · "kể cả khi gọi thẳng API" · "token 1 lần"

Người muốn một cái lịch không biết RLS, JWT hay room là gì. Đoạn này hiện đọc ra như **slide bảo vệ đồ án**, không như trang sản phẩm.

Nên viết lại theo lợi ích, giữ thuật ngữ ở dòng phụ nhỏ:

> **Không ai xem được lịch của bạn**
> Quyền được kiểm tra ở tầng sâu nhất của hệ thống — kể cả khi có người cố truy cập trực tiếp. *(Row-Level Security)*

### 27. Footer quá mỏng cho một sản phẩm thu thập dữ liệu

Hiện chỉ có: logo · 4 link · dòng copyright.

Thiếu: **Chính sách bảo mật**, **Điều khoản sử dụng**, thông tin liên hệ. Sản phẩm này đăng nhập bằng Google và gửi email tới người thứ ba — không có trang chính sách nào là một khoảng trống về pháp lý và về lòng tin.

### 28. SEO / chia sẻ mạng xã hội gần như trống

`frontend/src/index.html` chỉ có `<title>`. Không có:

- `<meta name="description">`
- `og:title` / `og:description` / `og:image`
- `twitter:card`
- `<link rel="canonical">`

Dán link trang này vào Zalo/Messenger/Facebook sẽ ra một ô trống không ảnh, không mô tả. Với một landing page thì đây là mất mát trực tiếp.

### 29. Tải font quá nặng

`index.html` tải **4 họ font** với rất nhiều weight:

| Font | Weight |
|---|---|
| Be Vietnam Pro | 300–900 + 2 italic (**11 biến thể**) |
| Inter | 300–900 (**7 biến thể**) |
| Outfit | 400–800 (5) |
| Plus Jakarta Sans | 400–800 (5) |

**~28 file font** trong khi trang thực tế chỉ dùng vài weight. Đây là thứ đánh trực tiếp vào LCP của chính trang landing này. Nên cắt còn 2 họ × 3–4 weight.

---

# P3 — Sức khoẻ code

### 30. ~180 dòng CSS bị dán trùng nguyên khối

`landing-page.css` dòng **981–1163** và **1256–1438** gần như giống hệt nhau. Đã `diff` xác nhận: khối preloader, `.particle`, `.cursor-ring`/`.cursor-dot`, `@media (pointer:coarse)`, `themeCircleReveal` đều xuất hiện **hai lần**.

Khác biệt duy nhất: khối đầu có thêm `.scroll-progress`, và `::view-transition` nằm ở vị trí khác nhau.

Đây không chỉ là dư thừa — nó là **bẫy bảo trì**: sửa preloader ở khối trên, khối dưới ghi đè lại và không hiểu tại sao không ăn.

### 31. File CSS 2581 dòng cho một component

Nên tách: `_hero.css`, `_scrolly.css`, `_cards.css`, `_preloader.css`, `_theme-light.css`.

### 32. Inline style mang giá trị layout trong HTML

```html
<div class="gallery-card reveal" style="flex:1.4;">   <!-- html:351 -->
<div class="gallery-card reveal" style="flex:1.3;">   <!-- html:368 -->
<div class="gallery" style="margin-top:70px;">        <!-- html:337 -->
<div class="grid-ring" style="width:640px;height:640px;">  <!-- html:66 -->
```

Số ma thuật nằm rải trong template, không có tên, không thể tái sử dụng. Đưa vào class (`.gallery-card--wide`) hoặc CSS custom property.

### 33. `initScrollAnimations` ghi đè `innerHTML` của mọi `.section-title`

`ts:293-311` tách tiêu đề thành từng từ rồi ghi lại `innerHTML` kèm **inline style**, trong đó có `transform: translateY(115%)`.

Nếu GSAP ném lỗi ở bất kỳ đâu sau bước này, mọi tiêu đề section bị đẩy khỏi khung hình vĩnh viễn. Cùng loại rủi ro với mục (1): trạng thái mặc định của trang là "ẩn", và JS mới là thứ làm nó hiện.

### 34. Event listener trên `window` không được gỡ

`ts:263` (`scroll`), `ts:585` (`mousemove`), `ts:651` (`mousemove`) — đăng ký trực tiếp trên `window` và không nằm trong `gsap.context()`, nên `ctx.revert()` ở `destroyRef.onDestroy` không dọn được chúng. Rời khỏi trang landing rồi, ba listener này vẫn chạy suốt vòng đời app.

### 35. `.feature-pin` / `.cal-card` / `.feature-visual` là CSS chết

`css:462-576` style cho `.feature-pin`, `.feature-text`, `.feature-visual`, `.cal-card`, `.cal-grid` — **không element nào trong template dùng đến**. Kể cả responsive rules (`css:1176-1183`) và light-theme rules (`css:1208-1229`) cho chúng. Tàn dư của phiên bản trước.

Tương tự `.btn-ghost` (`css:304-318`) — có style, không có ai dùng.

---

# Nếu chỉ làm được 7 việc

| # | Việc | Ảnh hưởng | Công |
|---|---|---|---|
| 1 | Cho `.hero-sub` / `.hero-cta` mặc định `opacity:1`, animation chỉ là lớp thêm | Sửa lỗi mất CTA | Thấp |
| 2 | `pointer-events: none` cho `#preloader`; gỡ `is-loading` bằng timeout an toàn, không chỉ dựa `onComplete` | Bỏ lớp chặn click | Thấp |
| 3 | Thêm menu hamburger cho `≤860px` | Trả lại navigation cho mobile | Trung bình |
| 4 | Thêm `:focus-visible` cho toàn bộ link/button | Accessibility cơ bản | Thấp |
| 5 | Rút preloader còn ≤1,2s, chỉ chạy 1 lần/phiên | Bớt 3,5s chờ mỗi lượt vào | Thấp |
| 6 | Đưa ảnh giao diện thật vào hero + thẻ showcase | Sức thuyết phục | Trung bình |
| 7 | Hạ `.scrolly` từ 640svh xuống ~400svh | Trang bớt lê thê | Thấp |

Sáu trong bảy việc trên là **sửa vài dòng**. Việc số 6 là việc duy nhất cần làm nội dung — và cũng là việc đổi nhiều nhất về tỉ lệ chuyển đổi.

---

## Điều đáng khen, nên giữ

Không phải chỗ nào cũng có vấn đề — mấy thứ sau làm tốt hơn mặt bằng chung khá nhiều:

- **Kỷ luật màu.** Một `--accent` duy nhất, mọi biến thể dẫn xuất bằng `color-mix()` thay vì hardcode. Đổi một biến là cả trang đổi theo. Rất ít dự án làm được.
- **Comment giải thích *tại sao*, không phải *cái gì*.** Ví dụ `css:243-245` giải thích `line-height: 1.3` là vì dấu tiếng Việt xếp cao hơn Latin; `ts:224-227` giải thích vì sao căn giữa bằng Grid chứ không phải `translate` (GSAP nuốt mất property). Đây là loại comment giữ cho người sau không phá lại.
- **Xử lý typography tiếng Việt.** Có tính tới dấu chồng dòng — đa số template Tây không tính.
- **Phần scrollytelling 3D.** Kỹ thuật rất chắc: một timeline duy nhất, `invalidateOnRefresh` để resize không gãy, tách `x` (timeline) khỏi `y` (tween trôi) để hai bên không ghi đè nhau. Vấn đề của nó là *dài quá*, không phải *làm dở*.
- **Section `#trust`.** Là block hoàn chỉnh nhất về mặt thị giác — icon, phân cấp, khoảng thở đều ổn. Chỉ cần sửa lại giọng văn.

---

---

# Đã sửa những gì

Ngày sửa: 24/08/2026. Mọi con số dưới đây đo lại trên `localhost:4200` sau khi sửa.

## Kết quả đo được

| Chỉ số | Trước | Sau |
|---|---:|---:|
| Chiều dài trang | 11.308px (13,7 màn hình) | **8.517px (10,3 màn hình)** |
| `.scrolly` chiếm | 5.284px — 47% trang | **~3.400px — 40% trang** |
| Chờ tới khi nút CTA hiện | ~4.500ms | **~900ms** (và chỉ lần đầu mỗi phiên) |
| `.hero-cta` khi tab mở ở nền | `opacity: 0` — mất nút | **`opacity: 1`** |
| `#preloader` sau intro | `display:flex`, nuốt click | **`display:none`, `pointer-events:none`** |
| Thẻ Showcase lệch hàng | 46px | **0px** |
| Chữ trong thẻ / bề rộng thẻ | 37% | **61%** |
| Số `:focus` style | 0 | **có, cho mọi link + button** |
| Menu mobile | không có | **hamburger + drawer + Escape** |
| Dòng CSS | 2.581 | **2.538** (bỏ 174 dòng trùng + CSS chết, thêm mới nhiều hơn) |
| Font tải về | 26 biến thể | **20 biến thể** |

## Chi tiết

**P0 — lỗi thật**

| # | Mục | Cách sửa |
|---|---|---|
| 1 | CTA vô hình | Đảo chiều mặc định: CSS để nội dung **đã hiện**, chỉ giấu khi TS gắn cổng `.js-anim`. Thêm `finishIntro()` idempotent gọi từ ba nguồn — `onComplete`, `setTimeout` failsafe (setTimeout vẫn chạy khi tab ở nền, khác `requestAnimationFrame`), và `visibilitychange`. Tab mở ở chế độ nền giờ bỏ qua intro luôn. |
| 2 | Overlay nuốt click | `#preloader` và `.preloader-panel` nhận `pointer-events: none`. |
| 3 | Rule chết do Angular scoping | Xoá `html.is-loading` (khoá cuộn vốn không hoạt động); chuyển `::selection` sang `styles.css`; xoá bản `::view-transition` trùng (bản global đã có sẵn ở `styles.css`). |
| 4 | Mobile không có nav | Thêm `.nav-burger` + `.mobile-menu` drawer, đóng bằng Escape / bấm scrim / bấm link. Dùng signal + `@if` theo đúng quy ước trong `CLAUDE.md`. |
| 5 | Không có focus style | Thêm `:focus-visible` hai lớp (outline accent + box-shadow) cho mọi link/button, bo tròn theo đúng hình nút. |

**P1 — UX & kiến trúc**

| # | Mục | Cách sửa |
|---|---|---|
| 6 | Trang quá dài | `.scrolly` 640svh → **420svh**; `.section-pad` 180px → **128px**; `.cta-section` 220/160 → **150/130**. |
| 7 | `#features` rỗng một màn hình | Thêm `.section-pad--lead` (bỏ padding đáy) để nó chảy thẳng vào `#scrolly` — nó vốn là phần mở đầu của khối đó. |
| 9 | Ba nhãn CTA | Thống nhất **"Bắt đầu miễn phí"** ở cả 4 chỗ. Thêm CTA phụ **"Xem tính năng"** dùng `.btn-ghost` (vốn có style mà không ai dùng). |
| 11 | Preloader 4,5s | Rút nhịp xuống 900ms và chỉ chạy **một lần mỗi phiên** (`sessionStorage`). |
| 12 | reduced-motion nửa vời | Gom về một khối: tắt thêm `.marquee`, `.particle`, `.scroll-hint .bar`, và guard trong TS cho `.grid-ring` xoay, `.orb` phồng, nút nam châm, thẻ nghiêng 3D. |
| 13 | Con trỏ tuỳ chỉnh trễ | Thời gian đuổi theo 0.4s → **0.16s**, hết cảm giác lag giả. |

**P2 — thị giác**

| # | Mục | Cách sửa |
|---|---|---|
| 14 | Thẻ lệch 46px | `.gallery-card` chuyển từ flex + `space-between` sang **Grid ba hàng cố định** (tag / tiêu đề / mô tả) → mọi thẻ tự khớp. |
| 15 | Chữ chỉ dùng 37% thẻ | `max-width: 280px` → **`46ch`**. |
| 16 | Khoảng trống 88px trong thẻ | Bỏ `padding-bottom: 48px` trên `.tag`; `min-height` 300 → 210px. |
| 18 | Vạch trang trí lệch lưới | `12/31/50/69/88%` → **`6/28/50/72/94%`**, khớp đúng đường chia 4 cột của `.process-grid`. |
| 19 | Mũi tên vô hình | Đổi từ `var(--line)` (α 0.13) sang màu pha accent, bọc trong hình tròn có viền, canh giữa cạnh nối thay vì `top: 44px`. |
| 20 | Ba cỡ display cạnh tranh | Thang rõ ràng: hero **96** › CTA **64** › section **52** › copy-step 38. |
| 21 | Chữ `.dim` như bị vô hiệu hoá | Từ `--ink-dim` (token chữ phụ) sang `color-mix(--ink 62%)` — vẫn nhạt hơn, nhưng không còn đọc ra là "kém quan trọng". |
| 22 | "Kéo xuống" dính nút CTA | `margin-top` 24px → **56px**. |
| 23 | CTA cuối: mô tả dính tiêu đề | Nhịp lại badge → H2 → 22px → sub → 40px → nút, `line-height` 1 → 1.08. |
| 25 | Trộn Việt/Anh | "Showcase" → "Khả năng"; "Group Workspace" → "Không gian nhóm"; "respond hộ" → "trả lời hộ". |
| 26 | Copy Bảo mật viết cho dev | Viết lại cả 4 thẻ theo lợi ích ("Không ai xem được lịch của bạn"), đẩy thuật ngữ xuống dòng phụ `.trust-tech`. |
| 28 | SEO trống | Thêm `description`, `theme-color`, Open Graph, Twitter Card vào `index.html`. |
| 29 | Font quá nặng | Bỏ weight 300/900 và 2 kiểu nghiêng không nơi nào dùng: **26 → 20 biến thể**. |

**P3 — code**

| # | Mục | Cách sửa |
|---|---|---|
| 30 | 174 dòng CSS dán trùng | Xoá hẳn khối thứ hai. |
| 32 | Inline style layout | `.grid-ring--lg/md/sm`, `.gallery-card--wide`, `.gallery` margin đưa vào CSS. `.word-mask`/`.word-inner` cũng chuyển từ inline style sang class — chính inline style đó (`vertical-align:top` + padding dọc) làm tiêu đề hai dòng tràn xuống chạm đoạn mô tả. |
| 33 | Trang phụ thuộc JS mới hiện | Cổng `.js-anim` + `try/catch` quanh phần init: animation hỏng thì chỉ mất animation, không mất nội dung. |
| 34 | Listener rò trên `window` | Helper `this.on()` đăng ký kèm đường gỡ, dọn trong `destroyRef.onDestroy`. |
| 35 | CSS chết | Xoá `.feature-pin`, `.feature-text`, `.feature-visual`, `.cal-card`, `.cal-grid`, `.tilt` cùng các rule responsive/light-theme của chúng. |

## Chưa làm — và vì sao

| # | Mục | Lý do |
|---|---|---|
| 8 | Ảnh giao diện thật trong hero + thẻ Showcase | **Đây là việc còn lại có giá trị nhất về tỉ lệ chuyển đổi.** Cần ảnh/GIF chụp app thật — không tự tạo được. Thẻ Showcase đã dựng sẵn Grid nên chỉ cần chèn thêm một hàng ảnh vào là xong. |
| 10 | Social proof / FAQ | Cần số liệu và nội dung thật (bao nhiêu người dùng, testimonial của ai). |
| 27 | Chính sách bảo mật / Điều khoản ở footer | Hai trang đó chưa tồn tại. Thêm link trỏ vào trang 404 còn tệ hơn là chưa có link. **Vẫn nên làm** — sản phẩm này đăng nhập Google và gửi email tới người thứ ba. |
| 29b | Bỏ hẳn một họ font | Be Vietnam Pro hiện chỉ là fallback hạng 2–3 trong mọi stack, gần như không bao giờ được render → bỏ được ~5 file font nữa. Không tự quyết vì nó là lưới an toàn cho dấu tiếng Việt, cần bạn xác nhận. |
| 31 | Tách file CSS 2.538 dòng | Thuần tổ chức code, không đổi gì với người dùng. |

## Ghi chú ngoài lề (không thuộc đánh giá UI)

Sau khi pull master, working tree có 3 file đang ở trạng thái **modified chưa commit**:

```
frontend/src/app/features/auth/login-page/login-page.css
frontend/src/app/features/landing/landing-page/landing-page.css
frontend/src/app/features/landing/landing-page/landing-page.html
```

Lúc bắt đầu phiên làm việc thì working tree sạch. Nhiều khả năng editor đang mở các file này với nội dung trong buffer, và đã ghi đè lên bản vừa pull về khi save. Nên chạy `git diff` với ba file đó để kiểm tra xem có thay đổi nào từ master bị ghi đè mất không, trước khi commit tiếp.
