# Prompt cho 7 việc còn lại của Landing Page

Mỗi prompt dưới đây tự đứng một mình. **Luôn dán KHỐI BỐI CẢNH CHUNG trước, rồi dán prompt cụ thể.**

Thứ tự nên làm: **1 → 3 → 5 → 6 → 2 → 4 → 7** (1 là thứ đổi nhiều nhất; 7 nên làm cuối vì nó xáo trộn file).

---

## KHỐI BỐI CẢNH CHUNG — dán trước mọi prompt

```
Dự án: Workflow — ứng dụng lịch, Angular v20+ standalone, repo tại D:\LichWorkflow.
Frontend ở frontend/, backend NestJS ở backend/, database Supabase.

File landing page:
  frontend/src/app/features/landing/landing-page/landing-page.html   (~593 dòng)
  frontend/src/app/features/landing/landing-page/landing-page.css    (~2538 dòng)
  frontend/src/app/features/landing/landing-page/landing-page.ts     (~783 dòng)
Style toàn cục: frontend/src/styles.css
Entry HTML:     frontend/src/index.html

Quy ước bắt buộc (đã ghi trong frontend/.claude/CLAUDE.md):
- Angular v20+: standalone mặc định, KHÔNG đặt `standalone: true`
- Dùng signal cho state, `computed()` cho derived state
- Dùng native control flow `@if` / `@for` / `@switch`, KHÔNG dùng *ngIf/*ngFor
- KHÔNG dùng @HostBinding/@HostListener — đặt trong object `host` của @Component
- KHÔNG dùng ngClass/ngStyle — dùng class binding / style binding
- ChangeDetectionStrategy.OnPush
- Dùng `inject()` thay vì constructor injection
- Phải đạt WCAG AA và pass AXE
- TypeScript strict, tránh `any`

RÀNG BUỘC QUAN TRỌNG — đừng phá hai thứ này:

1. Cổng animation `.js-anim`
   Trang này từng có bug nặng: nút CTA chính để `opacity: 0` trong CSS và chỉ
   được GSAP bật lên. Khi tab mở ở chế độ nền (Ctrl+Click, khôi phục phiên),
   requestAnimationFrame bị bóp nên timeline đứng giữa chừng và trang KHÔNG CÓ
   NÚT NÀO ĐỂ BẤM.
   Cách sửa hiện tại: CSS để mọi thứ MẶC ĐỊNH ĐÃ HIỆN. Chỉ khi TS gắn class
   `.js-anim` lên `.landing-container` thì các phần tử mới bị giấu để reveal.
   => TUYỆT ĐỐI không viết `opacity: 0` trần cho nội dung. Nếu cần trạng thái
      ẩn ban đầu, luôn viết dưới dạng `.js-anim .thing { opacity: 0 }`.

2. Pseudo-element cấp document phải để ở styles.css
   Component dùng ViewEncapsulation.Emulated, Angular sẽ thêm [_ngcontent-*]
   vào selector. Nên `::selection`, `::view-transition-*`, `html`, `body`
   viết trong landing-page.css sẽ thành rule CHẾT, không bao giờ khớp.
   => Những thứ đó đặt ở frontend/src/styles.css.

Kiểm tra trước khi báo xong:
  cd frontend
  npx tsc --noEmit -p tsconfig.app.json
  npx ng build --configuration development
Cả hai phải sạch. Nếu sửa giao diện, hãy chạy `npm start` và xem thật ở
http://localhost:4200/landing, đừng chỉ đọc code.

Bối cảnh thêm: file LANDING-UX-REVIEW.md ở gốc repo ghi lại toàn bộ đánh giá
UI/UX của trang này và những gì đã sửa. Đọc nó trước khi bắt tay.
```

---

## Prompt 1 — Đưa ảnh giao diện thật vào trang ⭐ ưu tiên cao nhất

> **Bạn phải chuẩn bị trước:** chụp 6–7 ảnh giao diện thật của app (PNG hoặc WebP,
> bề ngang ≥ 1200px) và bỏ vào `frontend/public/screenshots/`. Gợi ý cần chụp:
> `hero-calendar.png` (màn lịch tháng, đẹp nhất), `import.png`, `reminder.png`,
> `group.png`, `notes.png`, `views.png`, `trash.png`.
> Nếu chưa có ảnh, bảo AI dựng placeholder đúng tỉ lệ trước, thay ảnh sau.

```
Landing page hiện KHÔNG có một tấm ảnh giao diện thật nào — cả hero lẫn section
"Khả năng" (#showcase) đều chỉ có chữ. Đây là sản phẩm lịch, thứ mà giá trị nằm
ở chỗ nhìn thấy nó gọn và đẹp. Không cho xem giao diện là bỏ phí lợi thế lớn nhất
và là việc còn lại đáng giá nhất về tỉ lệ chuyển đổi.

Ảnh đã có sẵn ở frontend/public/screenshots/ (nếu thư mục trống, hãy dựng
placeholder SVG đúng tỉ lệ 16:10 và ghi chú rõ chỗ cần thay).

Việc 1 — Hero
Hiện hero chỉ có: eyebrow → h1 → mô tả → 2 nút → "Kéo xuống".
Thêm một ảnh giao diện lịch bên dưới cụm nút, kiểu "product shot" bị cắt ở mép
dưới màn hình để mời người ta cuộn tiếp. Yêu cầu:
- Dùng NgOptimizedImage (`ngSrc`) theo đúng quy ước dự án, kèm width/height thật
- Ảnh hero phải `priority` (nó là LCP của trang)
- Bo góc + viền 1px var(--line) + đổ bóng, hợp với ngôn ngữ thẻ đang có
- Đừng làm hero cao thêm quá 30% chiều cao màn hình
- Trạng thái ẩn ban đầu (nếu thêm animation) phải nằm sau `.js-anim`

Việc 2 — Sáu thẻ trong #showcase
`.gallery-card` hiện là CSS Grid `grid-template-rows: auto auto 1fr` với 3 hàng:
tag / tiêu đề `<h5>` / mô tả `<p>`, gap 14px, min-height 210px.
Thêm ảnh vào từng thẻ. Đề xuất: đổi thành 4 hàng `auto auto auto 1fr` với ảnh ở
hàng cuối, hoặc ảnh tràn mép dưới thẻ.
RÀNG BUỘC CỨNG: hiện 6 thẻ có `<h5>` thẳng hàng tuyệt đối (lệch 0px giữa 2 thẻ
cùng hàng). Trước đây chúng lệch 46px vì dùng flex + justify-content:space-between,
và nhìn ra là hỏng. Sau khi thêm ảnh, phải đo lại và giữ nguyên lệch 0px:

  document.querySelectorAll('.gallery-row').forEach((row,i)=>{
    const t=[...row.querySelectorAll('.gallery-card')].map(c=>
      Math.round(c.querySelector('h5').getBoundingClientRect().top
               - c.getBoundingClientRect().top));
    console.log('Hàng',i+1,t,'lệch',Math.abs(t[0]-t[1]));
  });

Việc 3 — min-height
`.gallery-card { min-height: 210px }` hiện đang thấp vì thẻ không có ảnh (comment
trong CSS đã ghi rõ điều này). Có ảnh rồi thì nâng lại cho cân.

Xong thì chạy `npm start`, chụp lại hero + #showcase, và báo cáo kèm số đo lệch
hàng đo được.
```

---

## Prompt 2 — Thống nhất hai hệ thẻ

```
Trang landing đang dùng HAI ngôn ngữ thẻ khác nhau ở ba section liền nhau, nên
đọc ra như hai hệ thiết kế bị ghép lại:

  .gallery-card (#showcase) và .trust-card (#trust):
    background: color-mix(in srgb, var(--accent) 5%, var(--card))
    border: 1px solid var(--line), border-radius: 20px
    ngăn cách bằng gap 24px / 22px
    có hover: translateY(-3..4px) + đổi màu viền + đổi nền

  .process-step (#process):
    background: var(--bg)   ← bằng đúng nền trang, thẻ "tàng hình"
    nằm trong .process-grid: gap 1px hairline, border-radius 24px bọc ngoài,
    overflow: hidden
    KHÔNG có hover

Việc cần làm: chọn MỘT trong hai hướng và làm cho nhất quán.

Hướng A (an toàn): giữ hai kiểu nhưng làm cho sự khác biệt đọc ra là CÓ CHỦ Ý —
  ví dụ thẻ nổi = "cái sản phẩm làm được", thẻ phẳng liền khối = "các bước nối
  tiếp nhau". Muốn vậy phải thống nhất bo góc, độ dày viền, padding, và ít nhất
  cho .process-step một trạng thái hover nhẹ để nó không chết cứng.

Hướng B (gọn hơn): đưa .process-step về cùng công thức mặt thẻ với hai cái kia.

Hãy phân tích cả hai rồi ĐỀ XUẤT một hướng kèm lý do, làm theo hướng đó, và
chụp ảnh ba section #showcase / #process / #trust cạnh nhau để so sánh.

Nhớ kiểm tra cả giao diện SÁNG (bấm nút theme ở góc phải nav) — trong CSS có
khối riêng "LIGHT THEME SURFACES & ELEVATIONS" cần cập nhật theo.
```

---

## Prompt 3 — Sửa lưới trang trí ở section CTA cuối

```
Ở section CTA cuối trang (.cta-section, id="story"), lớp trang trí `.cta-grid`
hiện ra thành vài đoạn thẳng đứng/ngang RỜI RẠC thay vì một tấm lưới liền mạch.
Nhìn ra như lỗi render, không như hoạ tiết.

CSS hiện tại (landing-page.css, khoảng dòng 946):

  .cta-grid {
    position: absolute; inset: 0; z-index: 0; pointer-events: none;
    background-image: linear-gradient(var(--line) 1px, transparent 1px),
      linear-gradient(90deg, var(--line) 1px, transparent 1px);
    background-size: 68px 68px;
    mask-image: radial-gradient(ellipse 62% 58% at 50% 46%, #000 8%, transparent 76%);
    -webkit-mask-image: radial-gradient(ellipse 62% 58% at 50% 46%, #000 8%, transparent 76%);
    opacity: 0.65;
  }

Nghi vấn: mask elip đang cắt lưới ở đúng chỗ các đường kẻ thưa (ô 68px), nên
chỉ còn sót vài đoạn ngẫu nhiên thay vì tan đều.

Việc cần làm:
- Mở trang, cuộn xuống cuối, nhìn thật rồi chẩn đoán đúng nguyên nhân
- Sửa sao cho lưới đọc ra là một tấm lưới mờ dần đều về mép (giảm background-size
  cho ô dày hơn, nới vùng đặc của mask, hoặc đổi hẳn cách tiếp cận)
- Kiểm tra ở cả 1440px và ~500px bề ngang, cả theme sáng và tối
- Lưới phải luôn nằm DƯỚI nội dung và giữ `pointer-events: none`

Chụp ảnh trước/sau.
```

---

## Prompt 4 — Trang Chính sách bảo mật và Điều khoản

```
Footer landing page hiện chỉ có: logo · 4 link điều hướng · dòng copyright.
Thiếu Chính sách bảo mật và Điều khoản sử dụng.

Đây không phải chuyện làm đẹp: sản phẩm này đăng nhập bằng Google (đọc hồ sơ +
email người dùng) và tự gửi email lời mời tới NGƯỜI THỨ BA. Không có trang chính
sách là một khoảng trống về pháp lý và về lòng tin.

Lý do trước đây chưa thêm link: hai trang đó chưa tồn tại, mà link trỏ vào 404
còn tệ hơn không có link. Nên việc này gồm cả tạo trang.

Việc cần làm:
1. Tạo hai route mới, lazy-loaded theo đúng quy ước dự án (xem app.routes.ts):
     /privacy  — Chính sách bảo mật
     /terms    — Điều khoản sử dụng
2. Component standalone, OnPush, dùng lại token màu/typography của landing
   (--bg, --ink, --ink-dim, --line, --accent, --font-heading, --font-sans)
   để hai trang không lạc khỏi phần còn lại
3. Nội dung tiếng Việt, viết theo ĐÚNG những gì hệ thống thật sự làm — hãy đọc
   backend/src/ và supabase/migrations/ để biết chính xác:
     - Dữ liệu nào được thu thập (đăng nhập Google lấy gì?)
     - Dữ liệu lưu ở đâu (Supabase), giữ bao lâu
     - Email gửi cho ai, chứa gì, token hết hạn sau bao lâu
     - Trợ lý AI gửi gì cho bên thứ ba nào
     - Người dùng xoá tài khoản/dữ liệu bằng cách nào
   ĐỪNG bịa điều khoản chung chung. Chỗ nào chưa rõ thì để TODO và hỏi lại.
4. Thêm link vào footer của landing page (.f-links) và cả footer/trang login
   nếu có
5. Hai trang phải đọc được trên mobile và pass AXE

Đây là nội dung pháp lý — cuối cùng vẫn cần người thật rà lại. Ghi rõ cảnh báo
đó ở đầu file khi bàn giao.
```

---

## Prompt 5 — Quyết định bỏ bớt font

```
frontend/src/index.html đang tải 4 họ font từ Google Fonts, mỗi họ 5 weight
(400;500;600;700;800) = 20 file font:
  Be Vietnam Pro, Inter, Outfit, Plus Jakarta Sans

Font là thứ chặn đường render đầu tiên của landing page, nên đây là chi phí thật.

Cách 4 họ này được dùng (qua CSS custom property):
  frontend/src/styles.css (toàn cục):
    --font-sans:    'Plus Jakarta Sans', system-ui, ...
    --font-heading: 'Outfit', 'Plus Jakarta Sans', system-ui, ...
  landing-page.css và login-page.css:
    --font-heading: 'Plus Jakarta Sans', 'Be Vietnam Pro', 'Inter', system-ui, ...
    --font-sans:    'Inter', 'Be Vietnam Pro', 'Plus Jakarta Sans', system-ui, ...

Nghi vấn: 'Be Vietnam Pro' luôn đứng hạng 2–3 trong mọi stack. Nếu Plus Jakarta
Sans và Inter đều tải được thì nó gần như KHÔNG BAO GIỜ được render — tức là 5
file font tải về vô ích. Nhưng nó cũng là lưới an toàn cho dấu tiếng Việt, nên
đừng vội xoá.

Việc cần làm:
1. Kiểm chứng bằng thực nghiệm, đừng đoán. Mở trang, dùng
   `document.fonts.check()` hoặc tab Network/Fonts của DevTools để xác định họ
   font nào THẬT SỰ được render ở landing, login và trang lịch chính
2. Xác nhận Plus Jakarta Sans và Inter có phủ đủ bộ dấu tiếng Việt hay không
   (thử các ký tự khó: ế ộ ữ ẳ ỹ ặ ườ)
3. Nếu đúng là Be Vietnam Pro không bao giờ được dùng → bỏ khỏi index.html và
   khỏi các font stack
4. Xem xét bỏ luôn Outfit nếu nó chỉ dùng cho vài tiêu đề (đo xem nó xuất hiện
   ở đâu trước khi quyết)
5. Cân nhắc `<link rel="preload">` cho 1–2 font quan trọng nhất
6. So sánh số file font và tổng KB trước/sau, báo cáo con số cụ thể

Đây là quyết định có thể làm ĐỔI DIỆN MẠO chữ trên toàn app. Trước khi xoá bất
cứ họ font nào, hãy chụp ảnh trước/sau của landing + login + trang lịch để
chứng minh không có gì đổi.
```

---

## Prompt 6 — Social proof và FAQ

> **Bạn phải cung cấp:** số liệu thật (bao nhiêu người dùng / nhóm đang dùng),
> testimonial thật nếu có, tên trường/lớp/tổ chức nếu muốn ghi.
> Nếu chưa có gì, bảo AI làm FAQ trước và bỏ qua phần social proof.

```
Landing page hiện không có bất kỳ lý do nào để một người lạ tin vào sản phẩm:
không số liệu, không testimonial, không FAQ, không so sánh với Google Calendar.
Mà trang lại yêu cầu người ta đăng nhập bằng tài khoản Google.

Việc cần làm — thêm một section FAQ trước phần CTA cuối (#story), trả lời đúng
những câu một người lạ sẽ hỏi:
  - Miễn phí thật không? Có gói trả phí ẩn không?
  - Đăng nhập Google thì các bạn thấy được gì trong tài khoản tôi?
  - Dữ liệu lịch của tôi lưu ở đâu?
  - Có xoá tài khoản và toàn bộ dữ liệu được không?
  - Khác gì Google Calendar?
  - Người tôi mời có cần cài app / tạo tài khoản không?

Câu trả lời phải ĐÚNG với hệ thống thật — đọc backend/src/ và
supabase/migrations/ để kiểm chứng, đừng viết cho hay.

Yêu cầu kỹ thuật:
- Dùng <details>/<summary> gốc hoặc accordion tự viết có ARIA đúng chuẩn
  (aria-expanded, aria-controls). Phải điều hướng được bằng bàn phím và pass AXE
- Dùng lại ngôn ngữ thẻ và token màu đang có, đừng phát minh style mới
- Trạng thái ẩn ban đầu (nếu có animation) phải nằm sau `.js-anim`
- Section mới phải có `.reveal` giống các section khác để reveal khi cuộn
- Cân nhắc thêm mục FAQ vào nav và vào drawer mobile (.mobile-menu)

Về social proof: [DÁN SỐ LIỆU / TESTIMONIAL THẬT CỦA BẠN VÀO ĐÂY].
Nếu tôi để trống mục này thì BỎ QUA phần social proof, chỉ làm FAQ. Tuyệt đối
không bịa số người dùng hay testimonial giả.

Lưu ý: trang hiện dài 10,3 màn hình, vừa mới được rút ngắn từ 13,7. Section FAQ
nên gọn, đừng làm trang phình lại.
```

---

## Prompt 7 — Tách file CSS (làm sau cùng)

```
frontend/src/app/features/landing/landing-page/landing-page.css dài ~2538 dòng
trong một file duy nhất. Cần tách cho dễ bảo trì.

Việc cần làm — tách theo khu vực, giữ nguyên 100% hành vi:
  _tokens.css       biến màu/font, theme sáng, focus, reduced-motion gom chung
  _nav.css          .landing-nav, .logo, .theme-toggle, .nav-burger, .mobile-menu
  _hero.css         .hero, .hero-ambient, .orb, .grid-ring, .particle, .scroll-hint
  _preloader.css    #preloader, .preloader-*, .scroll-progress, .cursor-*
  _sections.css     .section-pad, .kicker, .section-title, .word-mask, .marquee
  _cards.css        .gallery-*, .trust-*, .process-*, .chip
  _scrolly.css      toàn bộ khối 3D scrollytelling (.scrolly, .board-*, .node, .pop-*)
  _cta-footer.css   .cta-section, .cta-*, footer
  _fx.css           .sec-fx, .fx-*, .noise

Cách gộp lại: Angular component chỉ nhận `styleUrl` hoặc `styleUrls`. Hãy chọn
cách phù hợp với cấu hình dự án (styleUrls mảng, hoặc một file index dùng @import,
hoặc cấu hình includePaths) — kiểm tra angular.json trước rồi quyết.

RÀNG BUỘC CỨNG — đây là refactor thuần, KHÔNG được đổi hành vi:
1. THỨ TỰ CÁC LUẬT PHẢI GIỮ NGUYÊN. Trong file này có ít nhất hai chỗ phụ thuộc
   thứ tự, và cả hai đều đã từng gây bug:
     - `.gallery-card--wide { flex: 1.28 }` PHẢI nằm SAU `.gallery-card { flex: 1 }`
       (cùng độ đặc hiệu, viết trước là bị đè, mọi thẻ rộng bằng nhau)
     - `.section-pad--lead { padding-bottom: 0 }` phải được nhắc lại BÊN TRONG
       @media (max-width: 860px), vì luật `.section-pad` trong media query nằm
       sau và sẽ trả lại padding
   Sau khi tách, rà lại toàn bộ tìm các cặp cùng độ đặc hiệu tương tự.
2. Không xoá, không "dọn dẹp thêm", không đổi tên class, không gộp luật.
   Chỉ di chuyển. Muốn tối ưu gì thì làm ở PR riêng.
3. Giữ nguyên toàn bộ comment tiếng Việt — chúng giải thích TẠI SAO, và nhiều
   comment đang ghi lại đúng những cái bẫy đã từng làm hỏng trang này.

Cách nghiệm thu: build trước khi tách, lưu lại file CSS output trong
dist/frontend/. Tách xong build lại và diff hai file output. Khác biệt lý tưởng
là RỖNG, hoặc chỉ là thứ tự không ảnh hưởng. Dán kết quả diff vào báo cáo.
```

---

## Nhắc chung khi giao cho AI khác

- Bảo nó **đọc `LANDING-UX-REVIEW.md`** trước — trong đó có toàn bộ chẩn đoán, số đo, và lý do của từng quyết định đã làm.
- Nhiều comment trong `landing-page.css` và `.ts` ghi lại **những cái bẫy đã từng làm hỏng trang** (GSAP nuốt property `translate`, Angular scoping giết rule, thứ tự luật CSS). Bảo nó đừng xoá comment.
- Sau mỗi việc, yêu cầu chạy `npx tsc --noEmit -p tsconfig.app.json` và `npx ng build --configuration development`, và **xem trang thật** chứ không chỉ đọc code.
- Yêu cầu kiểm tra ở cả **theme sáng** (nút ở góc phải nav) — đây là chỗ hay bị bỏ sót nhất.
