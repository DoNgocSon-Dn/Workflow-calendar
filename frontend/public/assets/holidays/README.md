# Ảnh nền mờ cho popup + lịch (ngày lễ lớn)

Ảnh hiện có, lấy từ `calendar/hinh/` (đổi tên cho khớp id trong
`frontend/src/app/data/holidays.data.ts`):

| File | Ngày lễ | id |
| --- | --- | --- |
| `tet-nguyen-dan.jpg` | Tết Nguyên Đán | `tet-nguyen-dan` |
| `new-year.jpg` | Tết Dương Lịch (1/1) | `new-year` |
| `national-day.jpg` | Quốc khánh Việt Nam (2/9) | `national-day` |
| `reunification-day.jpg` | Giải phóng miền Nam (30/4) | `reunification-day` |
| `hung-kings.jpg` | Giỗ Tổ Hùng Vương | `hung-kings` |
| `labor-day.jpg` | Quốc tế Lao động (1/5) | `labor-day` |

Ảnh hiện ra ở 2 nơi, tự động theo cùng field `theme.backgroundImage`:
- Popup chúc mừng toàn màn hình (chỉ các lễ có `popupEnabled: true`)
- Nền mờ phía sau lưới lịch, theo ngày đang xem (`calendar-page.ts`)

Muốn thêm ảnh cho lễ khác: thả file `<id-lễ>.jpg` vào đây, rồi thêm dòng
`backgroundImage: '/assets/holidays/<id-lễ>.jpg'` vào `theme` của lễ đó trong
`holidays.data.ts`. Chưa có ảnh thì tự rơi về màu nền solid như cũ, không vỡ
giao diện.

File `calendar/hinh/HINH-NEN-TET-1-1.jpg.webp` chưa dùng tới (chưa rõ gán cho
lễ nào, `tet-nguyen-dan.jpg`/`new-year.jpg` đã có ảnh riêng rồi).
