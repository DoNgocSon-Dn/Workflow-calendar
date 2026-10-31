# Ngày lễ Việt Nam - Windows 1.2.0

## Cách dùng

Vào **Cài đặt > Giao diện > Giao diện ngày lễ > Tự động**. Đến ngày lễ, app
đổi màu, hiện dải thông tin ngày lễ và trang trí nền phù hợp. Hết ngày/kỳ lễ
trở về giao diện thông thường. Ngày được tính theo **giờ Việt Nam (UTC+7)**,
kể cả khi máy đang ở múi giờ khác; mở app xuyên nửa đêm hoặc cho máy ngủ rồi
mở lại vẫn cập nhật ngày lễ.

Vào **Cài đặt > Ngày lễ Việt Nam**, chọn năm, âm/dương lịch và tên dịp lễ,
bấm **Xem thử giao diện ngày lễ**. Xem thử tối đa 5 phút; có nhãn rõ ràng và nút
**Trở lại hôm nay**. Không đổi ngày hệ thống, không đổi ngày sự kiện/công việc,
không ghi dữ liệu thử lên cloud và không sửa lựa chọn tự động/tắt đã lưu.
Nút **Xem lời chúc** mở lại lời chúc của dịp đang xem.

Bật lịch chỉ đọc **Ngày lễ ở Việt Nam** trong thanh bên để xem đủ **49 dịp lễ
và ngày kỷ niệm** dựng sẵn; có thể lọc Dương lịch hoặc Âm lịch. Tết nhiều ngày
là một sự kiện kéo dài, không bị nhân thành năm sự kiện. Khi chuyển sang năm
khác trên lịch, danh sách được dựng lại cho năm đang xem.

## Những dịp tiêu biểu

| Dịp | Quy tắc ngày | Giao diện |
|---|---|---|
| Tết Nguyên Đán | Mùng 1-5 tháng Giêng | Đỏ/vàng, cành mai/đào, lì xì và lời chúc |
| Giao thừa âm lịch | Ngày cuối tháng Chạp, tự nhận 29 hoặc 30 | Cành Tết và lời chúc chuyển năm |
| Ông Công Ông Táo | 23 tháng Chạp | Không khí chuẩn bị Tết |
| Nguyên Tiêu | 15 tháng Giêng | Trăng tròn, đèn lồng |
| Giỗ Tổ Hùng Vương | 10/3 âm lịch | Trống đồng, tông đồng cổ |
| 30/4 | 30/4 dương lịch | Cờ đỏ sao vàng, Dinh Độc Lập, chim hòa bình |
| Quốc tế Lao động | 1/5 dương lịch | Chủ đề lao động |
| Đoan Ngọ | 5/5 âm lịch | Chủ đề cây lá và lời chúc sức khỏe |
| Vu Lan | 15/7 âm lịch | Hồng ấm, lời nhắn tri ân cha mẹ |
| Trung thu | 15/8 âm lịch | Trăng tròn, đèn lồng, tông xanh đêm/vàng |
| Quốc khánh | 2/9 dương lịch | Quốc kỳ, cảnh Việt Nam và lời chúc |
| Nhà giáo Việt Nam | 20/11 dương lịch | Sách và lời tri ân |

Giữ các chủ đề khác đã có như 8/3, 20/10, Giáng sinh, Halloween, Tết Dương
lịch. Các ngày kỷ niệm nhỏ dùng màu nhấn và dải thông tin gọn, không tự bật
popup dày đặc. Tắt hiệu ứng ngày lễ hoặc bật chế độ giảm chuyển động của hệ
thống để hạn chế hoạt ảnh. Nền trang trí không bắt thao tác chuột.

## Quy tắc và kiểm tra

- Âm lịch Việt Nam dùng UTC+7, tính theo năm, không nhập tay từng năm và không
  lặp ngày lễ thường vào tháng nhuận.
- Ngày trùng nhiều dịp giữ đủ trong lịch; chủ đề chọn theo độ ưu tiên, ví dụ
  mùng 5 Tết 2024 trùng Valentine vẫn ưu tiên Tết.
- Lời chúc tự động sau khi đóng chỉ hiện lại vào kỳ lễ năm sau; có thể chủ động
  mở lại. Không tự bật âm khi người dùng đã tắt âm thông báo.
- Có bản dịch vi/en, chế độ sáng/tối, kiểm tra tương phản màu nhấn, nút đóng và Escape.
- Đã sửa lỗi cảnh Trung thu không vẽ được trăng; cảnh 30/4 có sao vàng ở tâm cờ,
  di tích được đặt phía dưới để không che quốc kỳ. Bỏ các ảnh nền tham chiếu
  tới tệp không có sẵn.
- Frontend: **269 test / 45 file đạt**; desktop: **8 test đạt**. Gồm ngày âm
  2024-2027, tháng nhuận, Giao thừa 29/30, nửa đêm Việt Nam, máy ngủ/thức, trạng
  thái tắt/xem thử, không đổi đồng hồ và bộ chọn năm/ngày lễ.
- Đã xem thử Tết, 30/4, 2/9 và Trung thu trên giao diện thật, gồm chế độ sáng/tối.
- Windows **1.2.0** đã đóng gói, cài đè thành công, đăng nhập vào lịch và mở lời
  chúc Tết bằng mục Ngày lễ Việt Nam. Bản cài và bản portable được bàn giao trong
  thư mục `Workflow-Windows` cạnh repository; ảnh kiểm chứng ở
  `output/holidays/Windows-1.2.0-Tet-preview.png` cạnh repository.
- [CI cho mã nguồn 9669bd7](https://github.com/DoNgocSon-Dn/Workflow-calendar/actions/runs/41247079753)
  đạt cả bốn job; gồm 269 test frontend, 131 test backend và 8 test desktop.
- SHA-256 bản cài `Workflow-Calendar-Setup-1.2.0-x64.exe`:
  `C68466C37E6C5AA22A248C80CB74A2AE9FC97514271315ED7CFCD3E1E4686AB0`.

Danh sách mang tính văn hóa và tham khảo, không đại diện cho toàn bộ lễ hội
địa phương hoặc lịch nghỉ bù/lịch đi làm của từng cơ quan. Mốc 10/3 âm lịch,
30/4, 1/5 và 2/9 được đối chiếu với [Cổng Chính phủ](https://xaydungchinhsach.chinhphu.vn/lich-nghi-le-gio-to-hung-vuong-30-4-1-5-quoc-khanh-2-9-nam-2026-119260222115822151.htm);
Giỗ Tổ 2026 ngày 26/4 tương ứng 10/3 âm lịch được đối chiếu với
[thông tin lễ hội Đền Hùng 2026](https://xaydungchinhsach.chinhphu.vn/chi-tiet-thoi-gian-ke-hoach-to-chuc-gio-to-hung-vuong-le-hoi-den-hung-va-tuan-van-hoa-du-lich-dat-to-2026-119260329161504959.htm).
